-- CelMart · Fase 3: configuración compartida, entrega y seguimiento público seguro.
-- Ejecutar completo en el SQL Editor tras las migraciones anteriores. Es repetible.
begin;

create schema if not exists celmart_private;
revoke all on schema celmart_private from public, anon, authenticated;

create table if not exists public.configuracion_taller (
  id text primary key default 'default' constraint configuracion_taller_singleton check (id = 'default'),
  config_json jsonb not null constraint configuracion_taller_object check (jsonb_typeof(config_json) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.configuracion_taller enable row level security;
revoke all on public.configuracion_taller from public, anon;
grant select, insert, update, delete on public.configuracion_taller to authenticated;
drop policy if exists "celmart_configuracion_authenticated" on public.configuracion_taller;
create policy "celmart_configuracion_authenticated" on public.configuracion_taller
  for all to authenticated using (true) with check (true);

create or replace function celmart_private.stamp_config_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function celmart_private.stamp_config_updated_at() from public, anon, authenticated;
drop trigger if exists celmart_config_updated_at on public.configuracion_taller;
create trigger celmart_config_updated_at before insert or update on public.configuracion_taller
  for each row execute function celmart_private.stamp_config_updated_at();

alter table public.ordenes add column if not exists entregado_at timestamptz;
-- El seguimiento público nunca obtiene SELECT sobre la fila interna ni sobre las claves API.
alter table public.ordenes enable row level security;
revoke select on public.ordenes from public, anon;
grant select on public.ordenes to authenticated;

create or replace function celmart_private.stamp_first_delivery()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.entregado_at := case when new.estado = 'Entregado' then now() else null end;
  elsif old.entregado_at is not null then
    new.entregado_at := old.entregado_at;
  elsif new.estado = 'Entregado' and old.estado is distinct from 'Entregado' then
    new.entregado_at := now();
  else
    -- No inventar fechas para órdenes antiguas ya entregadas ni aceptar fechas del cliente.
    new.entregado_at := null;
  end if;
  return new;
end $$;
revoke all on function celmart_private.stamp_first_delivery() from public, anon, authenticated;
drop trigger if exists celmart_orden_first_delivery on public.ordenes;
create trigger celmart_orden_first_delivery before insert or update on public.ordenes
  for each row execute function celmart_private.stamp_first_delivery();

-- SECURITY DEFINER se limita a esta proyección pública explícita. Es necesario para
-- consultar una orden sin conceder SELECT anónimo sobre sus datos privados.
-- No usa SQL dinámico: sólo una coincidencia exacta por folio, acotada a una fila.
create or replace function public.get_order_tracking(p_order_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  tracked public.ordenes%rowtype;
  workshop jsonb;
  parts jsonb;
  phone_digits text;
begin
  if p_order_id is null or length(p_order_id) > 64 or p_order_id !~ '^OS-[0-9]+$' or p_order_id ~ '[[:space:]]' then
    return null;
  end if;
  select * into tracked from public.ordenes where id = p_order_id limit 1;
  if not found then return null; end if;

  select config_json into workshop from public.configuracion_taller where id = 'default' limit 1;
  workshop := coalesce(workshop, '{}'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object(
    'nombre', case when jsonb_typeof(part->'nombre') = 'string' then part->>'nombre' else 'Repuesto' end,
    'cantidad', case when jsonb_typeof(part->'cantidad') = 'number' then part->'cantidad' else '0'::jsonb end,
    'precioUnitario', case when jsonb_typeof(part->'precioUnitario') = 'number' then part->'precioUnitario' else '0'::jsonb end
  )), '[]'::jsonb) into parts
  from jsonb_array_elements(case when jsonb_typeof(tracked.repuestos_asignados) = 'array'
    then tracked.repuestos_asignados else '[]'::jsonb end) as assigned(part)
  where jsonb_typeof(part) = 'object';
  phone_digits := regexp_replace(coalesce(tracked.cliente_telefono, ''), '[^0-9]', '', 'g');

  return jsonb_build_object(
    'id', tracked.id,
    'estado', tracked.estado,
    'dispositivo', jsonb_build_object(
      'marca', coalesce(tracked.dispositivo_marca, ''),
      'modelo', coalesce(tracked.dispositivo_modelo, ''),
      'categoria', case when tracked.categoria_dispositivo in (
        'Smartphone', 'Consola', 'Control / Mando', 'PC / Laptop', 'Tablet', 'Microsoldadura / Placa'
      ) then tracked.categoria_dispositivo else 'Smartphone' end
    ),
    'fallaDeclarada', coalesce(tracked.falla_declarada, ''),
    'fotosEvidencia', coalesce(tracked.fotos_evidencia, '{}'::text[]),
    'costoManoObra', coalesce(tracked.costo_mano_obra, 0),
    'totalEstimado', coalesce(tracked.total_estimado, 0),
    'garantiaDias', coalesce(tracked.garantia_dias, 30),
    'fechaEntrega', tracked.entregado_at,
    'clienteTelefonoMascara', case when length(phone_digits) >= 4
      then '***-***-' || right(phone_digits, 4) else 'Sin teléfono' end,
    'repuestos', parts,
    'taller', jsonb_build_object(
      'nombre', case when jsonb_typeof(workshop->'nombreTaller') = 'string' then workshop->>'nombreTaller' else 'CelMart' end,
      'telefono', case when jsonb_typeof(workshop->'telefono') = 'string' then workshop->>'telefono' else '' end,
      'politicaGarantiaTexto', case when jsonb_typeof(workshop->'politicaGarantiaTexto') = 'string' then workshop->>'politicaGarantiaTexto' else '' end,
      'simboloMoneda', case when jsonb_typeof(workshop->'simboloMoneda') = 'string' then workshop->>'simboloMoneda' else '$' end
    )
  );
end $$;
revoke all on function public.get_order_tracking(text) from public, anon, authenticated;
grant execute on function public.get_order_tracking(text) to anon, authenticated;
comment on function public.get_order_tracking(text) is
  'Proyección pública por folio exacto. SECURITY DEFINER sólo permite devolver campos explícitos; excluye datos personales, notas internas y configuración API.';

-- Función privilegiada privada sólo para el trigger. El evento público invalida la
-- vista; no transmite registros, teléfonos, notas ni configuración a Realtime.
create or replace function celmart_private.broadcast_tracking_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tracking_id text;
begin
  tracking_id := case when tg_op = 'DELETE' then old.id else new.id end;
  perform realtime.send(jsonb_build_object('orderId', tracking_id), 'order_changed', 'tracking:' || tracking_id, false);
  return null;
end $$;
revoke all on function celmart_private.broadcast_tracking_change() from public, anon, authenticated;
drop trigger if exists celmart_tracking_changed on public.ordenes;
create trigger celmart_tracking_changed after insert or update or delete on public.ordenes
  for each row execute function celmart_private.broadcast_tracking_change();

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'configuracion_taller') then
    alter publication supabase_realtime add table public.configuracion_taller;
  end if;
end $$;

commit;

-- La configuración se inicializa desde la aplicación autenticada, sin sobrescribirla.
-- Comprobaciones posteriores: no hay concesiones SELECT para anon en estas tablas.
select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('ordenes', 'configuracion_taller')
  and grantee in ('anon', 'authenticated', 'PUBLIC') order by table_name, grantee, privilege_type;
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'configuracion_taller';
