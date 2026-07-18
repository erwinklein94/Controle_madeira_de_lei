-- Permissoes atualizadas em 18/07/2026.
-- Auditoria: somente Editor e Coordenador.
-- Padronizacao: Fiscal/Inspetor pode consultar, mas nao alterar.

alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_full_select on public.audit_logs;
create policy audit_logs_full_select on public.audit_logs
  for select to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador'));

alter table public.padroes enable row level security;
drop policy if exists padroes_select on public.padroes;
drop policy if exists padroes_admin_all on public.padroes;
drop policy if exists padroes_full_access on public.padroes;
drop policy if exists padroes_team_all on public.padroes;
drop policy if exists padroes_read_scope on public.padroes;
drop policy if exists padroes_full_insert on public.padroes;
drop policy if exists padroes_full_update on public.padroes;
drop policy if exists padroes_full_delete on public.padroes;

create policy padroes_read_scope on public.padroes
  for select to authenticated
  using (
    (select public.current_role_name()) in ('editor', 'coordenador', 'analista', 'fiscal')
    or (
      (select public.current_role_name()) = 'fornecedor'
      and categoria = 'pedido'
      and fornecedor = (select public.current_fornecedor())
    )
  );

create policy padroes_full_insert on public.padroes
  for insert to authenticated
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

create policy padroes_full_update on public.padroes
  for update to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'))
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

create policy padroes_full_delete on public.padroes
  for delete to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));
