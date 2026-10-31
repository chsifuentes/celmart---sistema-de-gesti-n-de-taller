begin;
alter table public.ordenes add column if not exists ubicacion_fisica text check(length(ubicacion_fisica)<=120),
 add column if not exists estado_actualizado_at timestamptz;
create or replace function celmart_private.stamp_order_status() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.estado_actualizado_at:=now();
 elsif new.estado is distinct from old.estado then new.estado_actualizado_at:=now();
 else new.estado_actualizado_at:=old.estado_actualizado_at;
 end if;
 return new;
end $$;
revoke all on function celmart_private.stamp_order_status() from public,anon,authenticated;
drop trigger if exists celmart_status_timestamp on public.ordenes;
create trigger celmart_status_timestamp before insert or update on public.ordenes for each row execute function celmart_private.stamp_order_status();
commit;
