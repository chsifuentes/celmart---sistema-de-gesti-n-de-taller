-- CelMart · Fase 1
-- Ejecutar completo en el SQL Editor del proyecto Supabase existente.
-- Se puede repetir: conserva órdenes, inventario y publicaciones ya configuradas.
begin;

alter table public.ordenes
  add column if not exists categoria_dispositivo text default 'Smartphone',
  add column if not exists checklist_json jsonb default '{}'::jsonb,
  add column if not exists notas_tecnicas jsonb default '[]'::jsonb,
  add column if not exists repuestos_asignados jsonb default '[]'::jsonb,
  add column if not exists fotos_evidencia text[] default '{}'::text[];

alter table public.inventario
  add column if not exists imagen_url text;

insert into storage.buckets (id, name, public)
values ('taller-media', 'taller-media', true)
on conflict (id) do update set public = excluded.public;

-- Acceso público de lectura/escritura solicitado para este bucket solamente.
-- Las demás políticas de Storage y las políticas de órdenes/inventario se conservan.
drop policy if exists "celmart_media_select" on storage.objects;
create policy "celmart_media_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'taller-media');

drop policy if exists "celmart_media_insert" on storage.objects;
create policy "celmart_media_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'taller-media');

drop policy if exists "celmart_media_update" on storage.objects;
create policy "celmart_media_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'taller-media')
  with check (bucket_id = 'taller-media');

drop policy if exists "celmart_media_delete" on storage.objects;
create policy "celmart_media_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'taller-media');

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ordenes'
    ) then
      alter publication supabase_realtime add table public.ordenes;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventario'
    ) then
      alter publication supabase_realtime add table public.inventario;
    end if;
  end if;
end $$;

commit;

-- Verificación: deben aparecer las seis columnas nuevas, el bucket público y ambas tablas.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'ordenes' and column_name in (
    'categoria_dispositivo', 'checklist_json', 'notas_tecnicas',
    'repuestos_asignados', 'fotos_evidencia'
  )) or (table_name = 'inventario' and column_name = 'imagen_url')
)
order by table_name, ordinal_position;

select id, name, public from storage.buckets where id = 'taller-media';
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('ordenes', 'inventario');
