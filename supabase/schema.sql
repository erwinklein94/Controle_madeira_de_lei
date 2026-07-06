-- =====================================================================
-- Controle de Inspeção e Transporte (Rumo) — esquema Supabase
-- Rode este script no painel do Supabase:
--   Dashboard -> SQL Editor -> New query -> cole tudo -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PERFIS
-- Liga cada usuário do Supabase Auth a um papel ('admin' ou 'fornecedor').
-- Para fornecedor, "fornecedor" guarda o nome exato usado nos registros
-- (ex.: 'Pandolfi'), que é como o RLS filtra o que ele pode ver.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin', 'fornecedor')),
  nome       text,
  fornecedor text,                       -- só para role = 'fornecedor'
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) REGISTROS
-- Um registro por pedido/etapa. Espelha os campos usados hoje no site.
-- ---------------------------------------------------------------------
create table if not exists public.registros (
  id                uuid primary key default gen_random_uuid(),
  fiscal            text,
  fornecedor        text not null,
  local             text,
  pedido            text not null,
  vol_pedido        numeric not null default 0,
  vol_pronto        numeric not null default 0,
  vol_inspecionado  numeric not null default 0,
  vol_liberado      numeric not null default 0,
  vol_transportado  numeric not null default 0,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now()
);

create index if not exists registros_fornecedor_idx on public.registros (fornecedor);

-- ---------------------------------------------------------------------
-- 3) FUNÇÕES AUXILIARES (security definer p/ evitar recursão de RLS)
-- Leem o papel/fornecedor do usuário atual sem disparar as políticas.
-- ---------------------------------------------------------------------
create or replace function public.current_role_name()
  returns text
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_fornecedor()
  returns text
  language sql stable security definer set search_path = public as $$
  select fornecedor from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 4) ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.registros enable row level security;

-- Perfis: cada um lê o próprio; admin lê/gerencia todos.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.current_role_name() = 'admin');

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- Registros: admin faz tudo.
drop policy if exists registros_admin_all on public.registros;
create policy registros_admin_all on public.registros
  for all using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- Registros: fornecedor só enxerga/mexe nos próprios (por nome de fornecedor).
drop policy if exists registros_fornecedor_select on public.registros;
create policy registros_fornecedor_select on public.registros
  for select using (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );

drop policy if exists registros_fornecedor_insert on public.registros;
create policy registros_fornecedor_insert on public.registros
  for insert with check (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );

drop policy if exists registros_fornecedor_update on public.registros;
create policy registros_fornecedor_update on public.registros
  for update using (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  )
  with check (fornecedor = public.current_fornecedor());

drop policy if exists registros_fornecedor_delete on public.registros;
create policy registros_fornecedor_delete on public.registros
  for delete using (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );

-- =====================================================================
-- 5) PRIMEIRO ADMIN (obrigatório — o RLS precisa de um admin para começar)
-- Passo a passo:
--   a) Dashboard -> Authentication -> Users -> Add user
--      Crie o e-mail/senha do administrador e copie o "User UID".
--   b) Rode o INSERT abaixo trocando <UID> pelo UID copiado:
--
--   insert into public.profiles (id, role, nome)
--   values ('<UID>', 'admin', 'Administrador');
--
-- Para um fornecedor (depois de criar o usuário em Authentication):
--   insert into public.profiles (id, role, nome, fornecedor)
--   values ('<UID>', 'fornecedor', 'Pandolfi', 'Pandolfi');
-- =====================================================================
