-- =====================================================================
-- Solicitações de alteração — fornecedor pede, administrador aprova.
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- Depende de schema.sql (funções) e pendencias.sql (tabela pendencias).
-- =====================================================================

create table if not exists public.solicitacoes (
  id                    uuid primary key default gen_random_uuid(),
  pendencia_id          uuid references public.pendencias (id) on delete cascade,
  fornecedor            text not null,
  pedido                text,
  vol_pedido_novo       numeric not null default 0,
  vol_transportado_novo numeric not null default 0,
  mensagem              text,
  status                text not null default 'pendente'
                          check (status in ('pendente', 'aprovada', 'recusada')),
  created_by            uuid references auth.users (id) default auth.uid(),
  created_at            timestamptz not null default now()
);

create index if not exists solicitacoes_status_idx on public.solicitacoes (status);

alter table public.solicitacoes enable row level security;

-- Admin: vê e decide tudo.
drop policy if exists solicitacoes_admin_all on public.solicitacoes;
create policy solicitacoes_admin_all on public.solicitacoes
  for all using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- Fornecedor: cria e acompanha as próprias (não edita nem exclui).
drop policy if exists solicitacoes_forn_select on public.solicitacoes;
create policy solicitacoes_forn_select on public.solicitacoes
  for select using (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );

drop policy if exists solicitacoes_forn_insert on public.solicitacoes;
create policy solicitacoes_forn_insert on public.solicitacoes
  for insert with check (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );

grant select, insert, update, delete on public.solicitacoes to authenticated;

-- IMPORTANTE: o fornecedor NÃO altera o histórico diretamente.
-- Remove as permissões de update/delete dele na tabela pendencias.
drop policy if exists pendencias_forn_update on public.pendencias;
drop policy if exists pendencias_forn_delete on public.pendencias;
