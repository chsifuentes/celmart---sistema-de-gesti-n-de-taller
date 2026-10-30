-- CelMart · Compatibilidad de esquema para Fase 2
-- Ejecutar completo en el SQL Editor del proyecto existente.
-- Conserva técnicos, movimientos, políticas ajenas y tablas de Realtime ya publicadas.
begin;

alter table public.tecnicos
  add column if not exists iniciales text,
  add column if not exists ordenes_activas integer default 0,
  add column if not exists capacidad_maxima integer default 5,
  add column if not exists horas_promedio numeric default 2.5,
  add column if not exists efectividad numeric default 98,
  add column if not exists salario_fijo numeric default 16000,
  add column if not exists avatar_bg text default 'bg-blue-600';

create table if not exists public.movimientos_inventario (
  id text primary key,
  repuesto_nombre text not null,
  codigo_orden text,
  tipo text not null constraint movimientos_inventario_tipo_check
    check (tipo in ('consumo', 'reabastecimiento', 'ajuste')),
  cantidad integer not null,
  autor text not null,
  tiempo text not null,
  created_at timestamptz not null default now()
);

-- El historial conserva el folio aunque la orden se elimine; no lleva FK a órdenes.
create index if not exists movimientos_inventario_created_at_idx
  on public.movimientos_inventario (created_at desc);

alter table public.tecnicos enable row level security;
alter table public.movimientos_inventario enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tecnicos to authenticated;
grant select, insert, update, delete on public.movimientos_inventario to authenticated;

-- Mismo acceso autenticado compartido del taller único que las tablas existentes.
-- Sólo se reemplazan políticas administradas por esta migración.
drop policy if exists "celmart_tecnicos_authenticated" on public.tecnicos;
create policy "celmart_tecnicos_authenticated" on public.tecnicos
  for all to authenticated using (true) with check (true);

drop policy if exists "celmart_movimientos_authenticated" on public.movimientos_inventario;
create policy "celmart_movimientos_authenticated" on public.movimientos_inventario
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tecnicos'
    ) then
      alter publication supabase_realtime add table public.tecnicos;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'movimientos_inventario'
    ) then
      alter publication supabase_realtime add table public.movimientos_inventario;
    end if;
  end if;
end $$;

commit;

-- Verificación de columnas, RLS, permisos y publicación tras ejecutar.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('tecnicos', 'movimientos_inventario')
order by table_name, ordinal_position;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and policyname in (
  'celmart_tecnicos_authenticated', 'celmart_movimientos_authenticated'
);

select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('tecnicos', 'movimientos_inventario');
