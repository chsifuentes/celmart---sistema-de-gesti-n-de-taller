-- CelMart · Esquema maestro (SDD, etapa 1)
-- Fuente SQL única para una instalación Supabase nueva o las tablas heredadas de CelMart.
-- Ejecutar completo con el rol administrador del SQL Editor. Se puede repetir.
-- Requiere los esquemas administrados auth, storage y realtime de Supabase.
-- No borra datos, no rellena fechas históricas, no reinicializa configuración.
-- Las migraciones anteriores permanecen en Git y en el historial del servidor.
begin;

create schema if not exists celmart_private;
revoke all on schema celmart_private from public, anon, authenticated;
grant usage on schema public, celmart_private to authenticated;

-- 1. Tablas y columnas actuales. Los defaults coinciden con la base desplegada.

create table if not exists public.clientes (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  telefono text not null,
  email text default 'sin-correo@cliente.com'::text,
  reparaciones_realizadas integer default 0,
  saldo_pendiente numeric default 0,
  ultima_visita text default 'Hoy'::text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.ordenes (
  id text primary key,
  prioridad_urgente boolean default false,
  cliente_nombre text not null,
  cliente_telefono text not null,
  cliente_email text,
  dispositivo_marca text not null,
  dispositivo_modelo text not null,
  dispositivo_imei text not null,
  dispositivo_color text,
  dispositivo_clave text,
  estado text default 'Recibido'::text,
  tecnico_nombre text,
  tecnico_iniciales text,
  ingreso text not null,
  falla_declarada text not null,
  pre_diagnostico text,
  observaciones_fisicas text,
  equipo_apagado boolean default false,
  costo_mano_obra numeric default 500,
  total_estimado numeric default 500,
  garantia_dias integer default 90,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  categoria_dispositivo text default 'Smartphone'::text,
  checklist_json jsonb default '{}'::jsonb,
  notas_tecnicas jsonb default '[]'::jsonb,
  repuestos_asignados jsonb default '[]'::jsonb,
  fotos_evidencia text[] default '{}'::text[],
  entregado_at timestamp with time zone,
  metodo_pago text,
  monto_cobrado numeric,
  parent_order_id text,
  motivo_garantia text,
  ubicacion_fisica text,
  estado_actualizado_at timestamp with time zone
);

create table if not exists public.inventario (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  sku text not null,
  categoria text not null,
  stock_actual integer default 0,
  stock_minimo integer default 2,
  costo_compra numeric default 0,
  precio_venta numeric default 0,
  compatibilidad text default 'General'::text,
  ubicacion text default 'Almacén'::text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  imagen_url text
);

create table if not exists public.tecnicos (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  especialidad text,
  estado text default 'Disponible'::text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  iniciales text,
  ordenes_activas integer default 0,
  capacidad_maxima integer default 5,
  horas_promedio numeric default 2.5,
  efectividad numeric default 98,
  salario_fijo numeric default 16000,
  avatar_bg text default 'bg-blue-600'::text
);

create table if not exists public.movimientos_inventario (
  id text primary key,
  repuesto_nombre text not null,
  codigo_orden text,
  tipo text not null,
  cantidad integer not null,
  autor text not null,
  tiempo text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.configuracion_taller (
  id text default 'default'::text primary key,
  config_json jsonb not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.cortes_caja (
  id text primary key,
  fecha date not null,
  monto_apertura numeric not null,
  total_efectivo numeric not null,
  total_transferencia numeric not null,
  gastos_repuestos numeric not null,
  total_neto numeric not null,
  cerrado_por text not null,
  observaciones text default ''::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.consumos_repuestos (
  id uuid default gen_random_uuid() primary key,
  orden_id text not null,
  sku text not null,
  cantidad integer not null,
  costo_unitario numeric not null,
  consumed_at timestamp with time zone default now() not null
);

create table if not exists celmart_private.sync_operations (
  operation_id uuid primary key,
  owner_id uuid not null,
  command_json jsonb not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

-- 2. Compatibilidad aditiva con el esquema anterior a las iteraciones.

alter table public.ordenes
  add column if not exists categoria_dispositivo text default 'Smartphone'::text,
  add column if not exists checklist_json jsonb default '{}'::jsonb,
  add column if not exists notas_tecnicas jsonb default '[]'::jsonb,
  add column if not exists repuestos_asignados jsonb default '[]'::jsonb,
  add column if not exists fotos_evidencia text[] default '{}'::text[],
  add column if not exists entregado_at timestamp with time zone,
  add column if not exists metodo_pago text,
  add column if not exists monto_cobrado numeric,
  add column if not exists parent_order_id text,
  add column if not exists motivo_garantia text,
  add column if not exists ubicacion_fisica text,
  add column if not exists estado_actualizado_at timestamp with time zone;

alter table public.inventario
  add column if not exists imagen_url text;

alter table public.tecnicos
  add column if not exists iniciales text,
  add column if not exists ordenes_activas integer default 0,
  add column if not exists capacidad_maxima integer default 5,
  add column if not exists horas_promedio numeric default 2.5,
  add column if not exists efectividad numeric default 98,
  add column if not exists salario_fijo numeric default 16000,
  add column if not exists avatar_bg text default 'bg-blue-600'::text;

-- Nombres estables: repetir el maestro no duplica restricciones.
do $constraints$
declare item record;
begin
  for item in select * from (values
    ('ordenes', 'ordenes_metodo_pago_check', 'CHECK ((metodo_pago = ANY (ARRAY[''Efectivo''::text, ''Transferencia''::text])))'),
    ('ordenes', 'ordenes_monto_cobrado_check', 'CHECK ((monto_cobrado >= (0)::numeric))'),
    ('ordenes', 'ordenes_parent_order_id_fkey', 'FOREIGN KEY (parent_order_id) REFERENCES public.ordenes(id)'),
    ('ordenes', 'ordenes_ubicacion_fisica_check', 'CHECK ((length(ubicacion_fisica) <= 120))'),
    ('inventario', 'inventario_sku_key', 'UNIQUE (sku)'),
    ('movimientos_inventario', 'movimientos_inventario_tipo_check', 'CHECK ((tipo = ANY (ARRAY[''consumo''::text, ''reabastecimiento''::text, ''ajuste''::text])))'),
    ('configuracion_taller', 'configuracion_taller_object', 'CHECK ((jsonb_typeof(config_json) = ''object''::text))'),
    ('configuracion_taller', 'configuracion_taller_singleton', 'CHECK ((id = ''default''::text))'),
    ('cortes_caja', 'cortes_caja_fecha_key', 'UNIQUE (fecha)'),
    ('cortes_caja', 'cortes_caja_monto_apertura_check', 'CHECK ((monto_apertura >= (0)::numeric))'),
    ('consumos_repuestos', 'consumos_repuestos_cantidad_check', 'CHECK ((cantidad > 0))'),
    ('consumos_repuestos', 'consumos_repuestos_costo_unitario_check', 'CHECK ((costo_unitario >= (0)::numeric))')
  ) as definitions(table_name, constraint_name, definition)
  loop
    if not exists (select 1 from pg_constraint where conrelid=to_regclass('public.'||item.table_name) and conname=item.constraint_name) then
      execute format('alter table public.%I add constraint %I %s',item.table_name,item.constraint_name,item.definition);
    end if;
  end loop;
end $constraints$;

create index if not exists movimientos_inventario_created_at_idx
  on public.movimientos_inventario (created_at desc);

-- 3. RLS y permisos: acceso compartido del taller autenticado; nada interno para anon.

alter table public.clientes enable row level security;
revoke all on public.clientes from public, anon, authenticated;
grant select, insert, update, delete on public.clientes to authenticated;
drop policy if exists "Auth access clientes" on public.clientes;
create policy "Auth access clientes" on public.clientes
  for all to authenticated using (true) with check (true);

alter table public.ordenes enable row level security;
revoke all on public.ordenes from public, anon, authenticated;
grant select, insert, update, delete on public.ordenes to authenticated;
drop policy if exists "Auth access ordenes" on public.ordenes;
create policy "Auth access ordenes" on public.ordenes
  for all to authenticated using (true) with check (true);

alter table public.inventario enable row level security;
revoke all on public.inventario from public, anon, authenticated;
grant select, insert, update, delete on public.inventario to authenticated;
drop policy if exists "Auth access inventario" on public.inventario;
create policy "Auth access inventario" on public.inventario
  for all to authenticated using (true) with check (true);

alter table public.tecnicos enable row level security;
revoke all on public.tecnicos from public, anon, authenticated;
grant select, insert, update, delete on public.tecnicos to authenticated;
drop policy if exists "Auth access tecnicos" on public.tecnicos;
drop policy if exists "celmart_tecnicos_authenticated" on public.tecnicos;
create policy "celmart_tecnicos_authenticated" on public.tecnicos
  for all to authenticated using (true) with check (true);

alter table public.movimientos_inventario enable row level security;
revoke all on public.movimientos_inventario from public, anon, authenticated;
grant select, insert, update, delete on public.movimientos_inventario to authenticated;
drop policy if exists "celmart_movimientos_authenticated" on public.movimientos_inventario;
create policy "celmart_movimientos_authenticated" on public.movimientos_inventario
  for all to authenticated using (true) with check (true);

alter table public.configuracion_taller enable row level security;
revoke all on public.configuracion_taller from public, anon, authenticated;
grant select, insert, update, delete on public.configuracion_taller to authenticated;
drop policy if exists "celmart_configuracion_authenticated" on public.configuracion_taller;
create policy "celmart_configuracion_authenticated" on public.configuracion_taller
  for all to authenticated using (true) with check (true);

alter table public.cortes_caja enable row level security;
revoke all on public.cortes_caja from public, anon, authenticated;
grant select, insert on public.cortes_caja to authenticated;
drop policy if exists "celmart_caja" on public.cortes_caja;
create policy "celmart_caja" on public.cortes_caja
  for all to authenticated using (true) with check (true);

alter table public.consumos_repuestos enable row level security;
revoke all on public.consumos_repuestos from public, anon, authenticated;
grant select, insert on public.consumos_repuestos to authenticated;
drop policy if exists "celmart_consumos" on public.consumos_repuestos;
create policy "celmart_consumos" on public.consumos_repuestos
  for all to authenticated using (true) with check (true);

alter table celmart_private.sync_operations enable row level security;
revoke all on celmart_private.sync_operations from public, anon, authenticated;
grant select, insert on celmart_private.sync_operations to authenticated;
drop policy if exists sync_operations_own_read on celmart_private.sync_operations;
create policy sync_operations_own_read on celmart_private.sync_operations
  for select to authenticated using (owner_id=(select auth.uid()));
drop policy if exists sync_operations_own_insert on celmart_private.sync_operations;
create policy sync_operations_own_insert on celmart_private.sync_operations
  for insert to authenticated with check (owner_id=(select auth.uid()));

-- 4. Storage: contrato histórico de bucket público, limitado a taller-media.
insert into storage.buckets (id,name,public) values ('taller-media','taller-media',true)
on conflict (id) do update set public=excluded.public;

drop policy if exists celmart_media_select on storage.objects;
create policy celmart_media_select on storage.objects for select to anon,authenticated
  using (bucket_id='taller-media');
drop policy if exists celmart_media_insert on storage.objects;
create policy celmart_media_insert on storage.objects for insert to anon,authenticated
  with check (bucket_id='taller-media');
drop policy if exists celmart_media_update on storage.objects;
create policy celmart_media_update on storage.objects for update to anon,authenticated
  using (bucket_id='taller-media')
  with check (bucket_id='taller-media');
drop policy if exists celmart_media_delete on storage.objects;
create policy celmart_media_delete on storage.objects for delete to anon,authenticated
  using (bucket_id='taller-media');

-- 5. Funciones finales: una definición por contrato; sin cadenas de reemplazos históricos.

CREATE OR REPLACE FUNCTION celmart_private.stamp_config_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION celmart_private.stamp_first_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION celmart_private.stamp_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if tg_op='INSERT' then new.estado_actualizado_at:=now();
 elsif new.estado is distinct from old.estado then new.estado_actualizado_at:=now();
 else new.estado_actualizado_at:=old.estado_actualizado_at;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION celmart_private.guard_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if old.estado='Entregado' and new.estado is distinct from 'Entregado' then raise exception 'La entrega original se conserva. Registra una suborden por garantía'; end if;
 if new.estado='Entregado' and old.estado is distinct from 'Entregado' then
  perform pg_advisory_xact_lock(hashtext('celmart-caja-'||(now() at time zone 'America/Mexico_City')::date::text));
  if new.metodo_pago is null or new.monto_cobrado is null then raise exception 'Registra método e importe del cobro'; end if;
  if exists(select 1 from public.cortes_caja where fecha=(now() at time zone 'America/Mexico_City')::date) then raise exception 'La caja de hoy ya está cerrada'; end if;
 end if;
 if old.estado='Entregado' and old.metodo_pago is not null and (new.metodo_pago is distinct from old.metodo_pago or new.monto_cobrado is distinct from old.monto_cobrado) then raise exception 'El cobro entregado es definitivo'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION celmart_private.broadcast_tracking_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tracking_id text;
begin
  tracking_id := case when tg_op = 'DELETE' then old.id else new.id end;
  perform realtime.send(jsonb_build_object('orderId', tracking_id), 'order_changed', 'tracking:' || tracking_id, false);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.resumen_caja(p_fecha date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('fecha',p_fecha,
 'total_efectivo',coalesce(sum(monto_cobrado) filter(where metodo_pago='Efectivo'),0),
 'total_transferencia',coalesce(sum(monto_cobrado) filter(where metodo_pago='Transferencia'),0),
 'sin_metodo',count(*) filter(where metodo_pago is null or monto_cobrado is null),
 'gastos_repuestos',(select coalesce(sum(cantidad*costo_unitario),0) from public.consumos_repuestos where (consumed_at at time zone 'America/Mexico_City')::date=p_fecha))
 from public.ordenes where estado='Entregado' and (entregado_at at time zone 'America/Mexico_City')::date=p_fecha;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_caja(p_apertura numeric, p_observaciones text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d date := (now() at time zone 'America/Mexico_City')::date; s jsonb; c public.cortes_caja;
begin
 if p_apertura is null or p_apertura<0 then raise exception 'Apertura inválida'; end if;
 perform pg_advisory_xact_lock(hashtext('celmart-caja-'||d::text));
 if exists(select 1 from public.cortes_caja where fecha=d) then raise exception 'La caja de este día ya está cerrada'; end if;
 s:=public.resumen_caja(d);
 if (s->>'sin_metodo')::int>0 then raise exception 'Hay entregas sin método o importe de pago. Regularízalas antes de cerrar'; end if;
 insert into public.cortes_caja values ('CAJA-'||d,d,p_apertura,(s->>'total_efectivo')::numeric,(s->>'total_transferencia')::numeric,(s->>'gastos_repuestos')::numeric,p_apertura+(s->>'total_efectivo')::numeric+(s->>'total_transferencia')::numeric-(s->>'gastos_repuestos')::numeric,coalesce(auth.jwt()->>'email',auth.uid()::text,'Usuario autenticado'),coalesce(p_observaciones,''),now()) returning * into c;
 return to_jsonb(c);
end $function$;

CREATE OR REPLACE FUNCTION public.reingreso_garantia(p_order_id text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.ordenes; child public.ordenes; n int; new_id text;
begin
 select * into o from public.ordenes where id=p_order_id for update;
 if not found or o.estado<>'Entregado' or o.entregado_at is null or now()<o.entregado_at or now()>=o.entregado_at+make_interval(days=>coalesce(o.garantia_dias,0)) then raise exception 'Garantía vencida o entrega sin fecha válida'; end if;
 if o.parent_order_id is not null then raise exception 'Registra el reingreso desde la orden original'; end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Indica el motivo de reingreso'; end if;
 select coalesce(max(substring(id from '-G([0-9]+)$')::int),0)+1 into n from public.ordenes where parent_order_id=o.id;
 new_id:=o.id||'-G'||n;
 insert into public.ordenes(id,cliente_nombre,cliente_telefono,cliente_email,dispositivo_marca,dispositivo_modelo,dispositivo_imei,dispositivo_color,dispositivo_clave,categoria_dispositivo,estado,tecnico_nombre,tecnico_iniciales,ingreso,falla_declarada,checklist_json,notas_tecnicas,repuestos_asignados,fotos_evidencia,costo_mano_obra,total_estimado,garantia_dias,parent_order_id,motivo_garantia)
 values(new_id,o.cliente_nombre,o.cliente_telefono,o.cliente_email,o.dispositivo_marca,o.dispositivo_modelo,o.dispositivo_imei,o.dispositivo_color,o.dispositivo_clave,o.categoria_dispositivo,'Garantía',o.tecnico_nombre,o.tecnico_iniciales,to_char(now() at time zone 'America/Mexico_City','DD Mon HH24:MI'),p_motivo,'{}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'autor','Recepción','fecha',now(),'contenido','Reingreso de garantía. Técnico responsable: '||coalesce(o.tecnico_nombre,'Por asignar')||'. Motivo: '||p_motivo,'tipo','general')),'[]','{}',0,0,o.garantia_dias,o.id,p_motivo) returning * into child;
 return to_jsonb(child);
end $function$;

CREATE OR REPLACE FUNCTION public.asignar_repuesto(p_order_id text, p_sku text, p_cantidad integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.ordenes; i public.inventario; item jsonb;
begin
 select * into o from public.ordenes where id=p_order_id for update;
 if not found or o.estado='Entregado' then raise exception 'Orden no editable'; end if;
 select * into i from public.inventario where sku=p_sku for update;
 if not found or p_cantidad is null or p_cantidad<=0 or i.stock_actual<p_cantidad then raise exception 'Stock insuficiente o cantidad inválida'; end if;
 perform pg_advisory_xact_lock(hashtext('celmart-caja-'||(now() at time zone 'America/Mexico_City')::date::text));
 if exists(select 1 from public.cortes_caja where fecha=(now() at time zone 'America/Mexico_City')::date) then raise exception 'La caja de hoy ya está cerrada'; end if;
 item:=jsonb_build_object('id',gen_random_uuid(),'nombre',i.nombre,'sku',i.sku,'cantidad',p_cantidad,'precioUnitario',i.precio_venta);
 update public.inventario set stock_actual=stock_actual-p_cantidad where id=i.id;
 insert into public.consumos_repuestos(orden_id,sku,cantidad,costo_unitario) values(o.id,i.sku,p_cantidad,coalesce(i.costo_compra,0));
 insert into public.movimientos_inventario(id,repuesto_nombre,codigo_orden,tipo,cantidad,autor,tiempo) values(gen_random_uuid()::text,i.nombre,o.id,'consumo',-p_cantidad,'Taller','Ahora');
 update public.ordenes set repuestos_asignados=coalesce(repuestos_asignados,'[]')||jsonb_build_array(item),total_estimado=coalesce(costo_mano_obra,0)+(select coalesce(sum((p->>'cantidad')::numeric*(p->>'precioUnitario')::numeric),0) from jsonb_array_elements(coalesce(o.repuestos_asignados,'[]')||jsonb_build_array(item)) p) where id=o.id returning * into o;
 return to_jsonb(o);
end $function$;

CREATE OR REPLACE FUNCTION public.apply_offline_operation(p_operation_id uuid, p_owner_id text, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 actor uuid := auth.uid();
 prior celmart_private.sync_operations;
 kind text := p_command->>'kind';
 o public.ordenes; i public.inventario; c public.clientes; m public.movimientos_inventario;
 r public.ordenes; ir public.inventario; cr public.clientes;
 result jsonb := '{}'::jsonb;
 target text := p_command->>'orderId';
 requested text;
 delta integer;
 parts_result jsonb;
begin
 if actor is null or p_owner_id is distinct from actor::text then raise exception 'Inicia sesión con la cuenta que guardó estos cambios.' using errcode='42501'; end if;
 if p_operation_id is null or jsonb_typeof(p_command) is distinct from 'object' then raise exception 'Operación inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 select * into prior from celmart_private.sync_operations where operation_id=p_operation_id and owner_id=actor;
 if found then
   if prior.command_json is distinct from p_command then raise exception 'El contenido de una operación ya confirmada no puede cambiar.'; end if;
   return prior.result_json || jsonb_build_object('replayed',true);
 end if;
 if kind in ('status','note','location','photo','payment','assignPart') then
   select * into o from public.ordenes where id=target for update;
   if not found then raise exception 'La orden ya no existe en el servidor.'; end if;
 end if;
 case kind
 when 'createOrder' then
   r:=jsonb_populate_record(null::public.ordenes,p_command->'row');
   if r.id is null or length(r.id)>64 or r.id !~ '^OS-[0-9]+(-[A-F0-9]{8})?(-G[0-9]+)?$' then raise exception 'Folio inválido'; end if;
   if r.estado is distinct from 'Recibido' then raise exception 'Una recepción debe iniciar como Recibido'; end if;
   insert into public.ordenes(id,prioridad_urgente,cliente_nombre,cliente_telefono,cliente_email,dispositivo_marca,dispositivo_modelo,dispositivo_imei,dispositivo_color,dispositivo_clave,estado,tecnico_nombre,tecnico_iniciales,ingreso,falla_declarada,pre_diagnostico,observaciones_fisicas,equipo_apagado,categoria_dispositivo,checklist_json,notas_tecnicas,repuestos_asignados,fotos_evidencia,costo_mano_obra,total_estimado,garantia_dias,created_at)
   values(r.id,coalesce(r.prioridad_urgente,false),r.cliente_nombre,r.cliente_telefono,r.cliente_email,r.dispositivo_marca,r.dispositivo_modelo,r.dispositivo_imei,r.dispositivo_color,r.dispositivo_clave,'Recibido',r.tecnico_nombre,r.tecnico_iniciales,r.ingreso,r.falla_declarada,r.pre_diagnostico,r.observaciones_fisicas,r.equipo_apagado,coalesce(r.categoria_dispositivo,'Smartphone'),coalesce(r.checklist_json,'{}'),coalesce(r.notas_tecnicas,'[]'),'[]',array(select jsonb_array_elements_text(coalesce(p_command->'photos','[]'))),coalesce(r.costo_mano_obra,0),coalesce(r.costo_mano_obra,0),coalesce(r.garantia_dias,30),least(coalesce(r.created_at,now()),now())) returning * into o;
 when 'status' then
   requested:=p_command->>'to';
   if requested not in ('Recibido','En Diagnóstico','Esperando Presupuesto','Esperando Repuesto','En Reparación','Listo','Entregado','Garantía') or requested is null then raise exception 'Estado inválido'; end if;
   if o.estado is distinct from requested then
     if o.estado is distinct from p_command->>'from' then raise exception 'Conflicto: otra persona cambió el estado. Revisa la orden antes de sincronizar.'; end if;
     if o.estado='Entregado' then raise exception 'La entrega original se conserva. Usa reingreso por garantía.'; end if;
     if requested='Entregado' and (o.estado<>'Listo' or o.metodo_pago is null or o.monto_cobrado is null) then raise exception 'Marca Listo y registra el cobro antes de entregar.'; end if;
     update public.ordenes set estado=requested where id=o.id returning * into o;
   end if;
 when 'note' then
   if coalesce(p_command->'note'->>'id','')='' or length(btrim(coalesce(p_command->'note'->>'contenido','')))=0 then raise exception 'Nota inválida'; end if;
   if not exists(select 1 from jsonb_array_elements(coalesce(o.notas_tecnicas,'[]')) n where n->>'id'=p_command->'note'->>'id') then
     update public.ordenes set notas_tecnicas=jsonb_build_array(p_command->'note')||coalesce(notas_tecnicas,'[]') where id=o.id returning * into o;
   end if;
 when 'location' then
   requested:=btrim(p_command->>'value');
   if requested is null or length(requested)=0 or length(requested)>120 then raise exception 'Ubicación inválida'; end if;
   update public.ordenes set ubicacion_fisica=requested where id=o.id returning * into o;
 when 'photo' then
   requested:=p_command->>'url';
   if requested is null or requested !~ '^https?://' then raise exception 'La foto debe estar subida a Storage antes de sincronizar.'; end if;
   if not (requested=any(coalesce(o.fotos_evidencia,'{}'))) then update public.ordenes set fotos_evidencia=array_append(coalesce(fotos_evidencia,'{}'),requested) where id=o.id returning * into o; end if;
 when 'payment' then
   if p_command->>'method' not in ('Efectivo','Transferencia') or (p_command->>'amount')::numeric<0 then raise exception 'Cobro inválido'; end if;
   update public.ordenes set metodo_pago=p_command->>'method',monto_cobrado=(p_command->>'amount')::numeric where id=o.id returning * into o;
 when 'assignPart' then
   select * into i from public.inventario where id=(p_command->>'itemId')::uuid and sku=p_command->'part'->>'sku';
   if not found then raise exception 'El repuesto cambió. Revisa el inventario.'; end if;
   parts_result:=public.asignar_repuesto(o.id,i.sku,(p_command->'part'->>'cantidad')::integer);
   select * into o from public.ordenes where id=o.id;
   select * into i from public.inventario where id=i.id;
 when 'stock' then
   select * into i from public.inventario where id=(p_command->>'itemId')::uuid for update;
   if not found then raise exception 'El repuesto ya no existe.'; end if;
   delta:=(p_command->>'delta')::integer;
   if delta is null or delta=0 or i.stock_actual+delta<0 then raise exception 'Stock insuficiente para aplicar el ajuste pendiente.'; end if;
   update public.inventario set stock_actual=stock_actual+delta where id=i.id returning * into i;
   insert into public.movimientos_inventario(id,repuesto_nombre,tipo,cantidad,autor,tiempo)
   values(p_operation_id::text,i.nombre,case when delta>0 then 'reabastecimiento' else 'consumo' end,delta,'Taller','Ahora') returning * into m;
 when 'createInventory' then
   ir:=jsonb_populate_record(null::public.inventario,p_command->'row');
   perform pg_advisory_xact_lock(hashtextextended('celmart-sku-'||ir.sku,0));
   if exists(select 1 from public.inventario where sku=ir.sku) then raise exception 'Ya existe un repuesto con este SKU. Conserva el cambio pendiente y revisa su SKU.'; end if;
   if ir.stock_actual<0 or ir.stock_minimo<0 or ir.costo_compra<0 or ir.precio_venta<0 then raise exception 'Importes o cantidades inválidos'; end if;
   insert into public.inventario(id,nombre,sku,categoria,stock_actual,stock_minimo,costo_compra,precio_venta,compatibilidad,ubicacion,imagen_url)
   values(ir.id,ir.nombre,ir.sku,ir.categoria,ir.stock_actual,ir.stock_minimo,ir.costo_compra,ir.precio_venta,ir.compatibilidad,ir.ubicacion,ir.imagen_url) returning * into i;
 when 'editInventory' then
   ir:=jsonb_populate_record(null::public.inventario,p_command->'row');
   select * into i from public.inventario where id=ir.id for update;
   if not found then raise exception 'El repuesto ya no existe.'; end if;
   if i.stock_actual is distinct from (p_command->>'previousStock')::integer then raise exception 'Conflicto: el stock cambió en otro dispositivo. Revisa el repuesto antes de sincronizar.'; end if;
   if ir.stock_actual<0 or ir.stock_minimo<0 or ir.costo_compra<0 or ir.precio_venta<0 then raise exception 'Importes o cantidades inválidos'; end if;
   if exists(select 1 from public.inventario where sku=ir.sku and id<>ir.id) then raise exception 'Ya existe otro repuesto con este SKU.'; end if;
   update public.inventario set nombre=ir.nombre,sku=ir.sku,categoria=ir.categoria,stock_actual=ir.stock_actual,stock_minimo=ir.stock_minimo,costo_compra=ir.costo_compra,precio_venta=ir.precio_venta,compatibilidad=ir.compatibilidad,ubicacion=ir.ubicacion,imagen_url=ir.imagen_url where id=ir.id returning * into i;
 when 'createClient' then
   cr:=jsonb_populate_record(null::public.clientes,p_command->'row');
   insert into public.clientes(id,nombre,telefono,email) values(cr.id,cr.nombre,cr.telefono,cr.email) returning * into c;
 else raise exception 'Tipo de operación no permitido';
 end case;
 if o.id is not null then result:=result||jsonb_build_object('orders',jsonb_build_array(to_jsonb(o))); end if;
 if i.id is not null then result:=result||jsonb_build_object('inventory',jsonb_build_array(to_jsonb(i))); end if;
 if c.id is not null then result:=result||jsonb_build_object('clients',jsonb_build_array(to_jsonb(c))); end if;
 if m.id is not null then result:=result||jsonb_build_object('movements',jsonb_build_array(to_jsonb(m))); end if;
 insert into celmart_private.sync_operations(operation_id,owner_id,command_json,result_json) values(p_operation_id,actor,p_command,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.get_order_tracking(p_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  tracked public.ordenes%rowtype;
  workshop jsonb;
  parts jsonb;
  phone_digits text;
begin
  if p_order_id is null or length(p_order_id) > 64 or p_order_id !~ '^OS-[0-9]+(-[A-F0-9]{8})?(-G[0-9]+)?$' or p_order_id ~ '[[:space:]]' then
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
end $function$;

-- Los helpers de trigger no son endpoints públicos.
revoke all on function celmart_private.stamp_config_updated_at(),celmart_private.stamp_first_delivery(),celmart_private.stamp_order_status(),celmart_private.guard_payment(),celmart_private.broadcast_tracking_change() from public,anon,authenticated;
revoke all on function public.resumen_caja(date),public.cerrar_caja(numeric,text),public.reingreso_garantia(text,text),public.asignar_repuesto(text,text,integer),public.apply_offline_operation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.resumen_caja(date),public.cerrar_caja(numeric,text),public.reingreso_garantia(text,text),public.asignar_repuesto(text,text,integer),public.apply_offline_operation(uuid,text,jsonb) to authenticated;
revoke all on function public.get_order_tracking(text) from public,anon,authenticated;
grant execute on function public.get_order_tracking(text) to anon,authenticated;
comment on function public.get_order_tracking(text) is 'Proyección pública por folio exacto; excluye PIN, IMEI, notas internas, datos personales completos y claves API.';

-- 6. Triggers con nombres estables y fechas autoritativas del servidor.

drop trigger if exists celmart_config_updated_at on public.configuracion_taller;
create trigger celmart_config_updated_at before insert or update on public.configuracion_taller
  for each row execute function celmart_private.stamp_config_updated_at();

drop trigger if exists celmart_orden_first_delivery on public.ordenes;
create trigger celmart_orden_first_delivery before insert or update on public.ordenes
  for each row execute function celmart_private.stamp_first_delivery();

drop trigger if exists celmart_status_timestamp on public.ordenes;
create trigger celmart_status_timestamp before insert or update on public.ordenes
  for each row execute function celmart_private.stamp_order_status();

drop trigger if exists celmart_payment_guard on public.ordenes;
create trigger celmart_payment_guard before update on public.ordenes
  for each row execute function celmart_private.guard_payment();

drop trigger if exists celmart_tracking_changed on public.ordenes;
create trigger celmart_tracking_changed after insert or update or delete on public.ordenes
  for each row execute function celmart_private.broadcast_tracking_change();

-- 7. Realtime: sólo agregar tablas ausentes; conservar otras publicaciones.
do $publication$
declare table_name text;
begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication where pubname='supabase_realtime' and puballtables) then
    foreach table_name in array array['ordenes','inventario','tecnicos','movimientos_inventario','configuracion_taller']
    loop
      if not exists (select 1 from pg_publication_tables p where p.pubname='supabase_realtime' and p.schemaname='public' and p.tablename=table_name) then
        execute format('alter publication supabase_realtime add table public.%I',table_name);
      end if;
    end loop;
  end if;
end $publication$;

commit;
