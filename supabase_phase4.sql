begin;
alter table public.ordenes add column if not exists metodo_pago text check (metodo_pago in ('Efectivo','Transferencia')),
 add column if not exists monto_cobrado numeric check (monto_cobrado >= 0),
 add column if not exists parent_order_id text references public.ordenes(id),
 add column if not exists motivo_garantia text;
create table if not exists public.cortes_caja (
 id text primary key, fecha date not null unique, monto_apertura numeric not null check(monto_apertura>=0),
 total_efectivo numeric not null, total_transferencia numeric not null, gastos_repuestos numeric not null,
 total_neto numeric not null, cerrado_por text not null, observaciones text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.consumos_repuestos (
 id uuid primary key default gen_random_uuid(), orden_id text not null,
 sku text not null, cantidad integer not null check(cantidad>0), costo_unitario numeric not null check(costo_unitario>=0),
 consumed_at timestamptz not null default now()
);
alter table public.cortes_caja enable row level security;
alter table public.consumos_repuestos enable row level security;
revoke all on public.cortes_caja, public.consumos_repuestos from anon, public;
grant select,insert on public.cortes_caja,public.consumos_repuestos to authenticated;
drop policy if exists celmart_caja on public.cortes_caja;
create policy celmart_caja on public.cortes_caja for all to authenticated using(true) with check(true);
drop policy if exists celmart_consumos on public.consumos_repuestos;
create policy celmart_consumos on public.consumos_repuestos for all to authenticated using(true) with check(true);
create or replace function public.resumen_caja(p_fecha date) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('fecha',p_fecha,
 'total_efectivo',coalesce(sum(monto_cobrado) filter(where metodo_pago='Efectivo'),0),
 'total_transferencia',coalesce(sum(monto_cobrado) filter(where metodo_pago='Transferencia'),0),
 'sin_metodo',count(*) filter(where metodo_pago is null or monto_cobrado is null),
 'gastos_repuestos',(select coalesce(sum(cantidad*costo_unitario),0) from public.consumos_repuestos where (consumed_at at time zone 'America/Mexico_City')::date=p_fecha))
 from public.ordenes where estado='Entregado' and (entregado_at at time zone 'America/Mexico_City')::date=p_fecha;
$$;
create or replace function public.cerrar_caja(p_apertura numeric,p_observaciones text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d date := (now() at time zone 'America/Mexico_City')::date; s jsonb; c public.cortes_caja;
begin
 if p_apertura is null or p_apertura<0 then raise exception 'Apertura inválida'; end if;
 perform pg_advisory_xact_lock(hashtext('celmart-caja-'||d::text));
 if exists(select 1 from public.cortes_caja where fecha=d) then raise exception 'La caja de este día ya está cerrada'; end if;
 s:=public.resumen_caja(d);
 if (s->>'sin_metodo')::int>0 then raise exception 'Hay entregas sin método o importe de pago. Regularízalas antes de cerrar'; end if;
 insert into public.cortes_caja values ('CAJA-'||d,d,p_apertura,(s->>'total_efectivo')::numeric,(s->>'total_transferencia')::numeric,(s->>'gastos_repuestos')::numeric,p_apertura+(s->>'total_efectivo')::numeric+(s->>'total_transferencia')::numeric-(s->>'gastos_repuestos')::numeric,coalesce(auth.jwt()->>'email',auth.uid()::text,'Usuario autenticado'),coalesce(p_observaciones,''),now()) returning * into c;
 return to_jsonb(c);
end $$;
create or replace function public.reingreso_garantia(p_order_id text,p_motivo text) returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;
create or replace function public.asignar_repuesto(p_order_id text,p_sku text,p_cantidad integer) returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;
revoke all on function public.resumen_caja(date),public.cerrar_caja(numeric,text),public.reingreso_garantia(text,text),public.asignar_repuesto(text,text,integer) from public,anon;
grant execute on function public.resumen_caja(date),public.cerrar_caja(numeric,text),public.reingreso_garantia(text,text),public.asignar_repuesto(text,text,integer) to authenticated;
create or replace function celmart_private.guard_payment() returns trigger language plpgsql set search_path='' as $$
begin
 if new.estado='Entregado' and old.estado is distinct from 'Entregado' then
  perform pg_advisory_xact_lock(hashtext('celmart-caja-'||(now() at time zone 'America/Mexico_City')::date::text));
  if new.metodo_pago is null or new.monto_cobrado is null then raise exception 'Registra método e importe del cobro'; end if;
  if exists(select 1 from public.cortes_caja where fecha=(now() at time zone 'America/Mexico_City')::date) then raise exception 'La caja de hoy ya está cerrada'; end if;
 end if;
 if old.estado='Entregado' and old.metodo_pago is not null and (new.metodo_pago is distinct from old.metodo_pago or new.monto_cobrado is distinct from old.monto_cobrado) then raise exception 'El cobro entregado es definitivo'; end if;
 return new;
end $$;
revoke all on function celmart_private.guard_payment() from public,anon,authenticated;
drop trigger if exists celmart_payment_guard on public.ordenes;
create trigger celmart_payment_guard before update on public.ordenes for each row execute function celmart_private.guard_payment();
do $$ begin execute replace(pg_get_functiondef('public.get_order_tracking(text)'::regprocedure),'^OS-[0-9]+$','^OS-[0-9]+(-G[0-9]+)?$'); end $$;
commit;
