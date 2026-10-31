begin;
create schema if not exists celmart_private;
create table if not exists celmart_private.sync_operations (
 operation_id uuid primary key,
 owner_id uuid not null,
 command_json jsonb not null,
 result_json jsonb not null,
 created_at timestamptz not null default now()
);
alter table celmart_private.sync_operations enable row level security;
revoke all on celmart_private.sync_operations from public, anon, authenticated;
grant usage on schema celmart_private to authenticated;
grant select, insert on celmart_private.sync_operations to authenticated;
create policy sync_operations_own_read on celmart_private.sync_operations for select to authenticated using (owner_id=(select auth.uid()));
create policy sync_operations_own_insert on celmart_private.sync_operations for insert to authenticated with check (owner_id=(select auth.uid()));

create or replace function public.apply_offline_operation(p_operation_id uuid, p_owner_id text, p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
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
end $$;
revoke all on function public.apply_offline_operation(uuid,text,jsonb) from public, anon;
grant execute on function public.apply_offline_operation(uuid,text,jsonb) to authenticated;

-- Extend only the exact folio validation; the existing public projection stays private-safe.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.get_order_tracking(text)'::regprocedure) into definition;
 execute replace(definition,'^OS-[0-9]+(-G[0-9]+)?$','^OS-[0-9]+(-[A-F0-9]{8})?(-G[0-9]+)?$');
end $$;
commit;
