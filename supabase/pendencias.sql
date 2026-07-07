-- =====================================================================
-- Informações pendentes — fluxo fornecedor -> administrador
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- Depende das funções current_role_name() / current_fornecedor() (schema.sql).
-- =====================================================================

create table if not exists public.pendencias (
  id               uuid primary key default gen_random_uuid(),
  fornecedor       text not null,
  pedido           text not null,
  vol_pedido       numeric not null default 0,
  vol_transportado numeric not null default 0,
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now()
);

create index if not exists pendencias_fornecedor_idx on public.pendencias (fornecedor);

alter table public.pendencias enable row level security;

-- Admin: vê e gerencia tudo.
drop policy if exists pendencias_admin_all on public.pendencias;
create policy pendencias_admin_all on public.pendencias
  for all using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- Fornecedor: só os próprios (por nome de fornecedor).
drop policy if exists pendencias_forn_select on public.pendencias;
create policy pendencias_forn_select on public.pendencias
  for select using (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );

drop policy if exists pendencias_forn_insert on public.pendencias;
create policy pendencias_forn_insert on public.pendencias
  for insert with check (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );

drop policy if exists pendencias_forn_update on public.pendencias;
create policy pendencias_forn_update on public.pendencias
  for update using (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  )
  with check (fornecedor = public.current_fornecedor());

drop policy if exists pendencias_forn_delete on public.pendencias;
create policy pendencias_forn_delete on public.pendencias
  for delete using (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );

-- Permissões de tabela para o papel logado.
grant select, insert, update, delete on public.pendencias to authenticated;
