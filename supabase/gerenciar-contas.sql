-- =====================================================================
-- Gerenciar contas — permite excluir contas sem travar nos vínculos.
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
--
-- Ao excluir uma conta, os envios/registros criados por ela são
-- preservados (o campo created_by apenas fica vazio). Sem este ajuste,
-- a exclusão falharia por violação de chave estrangeira.
-- =====================================================================

alter table public.pendencias
  drop constraint if exists pendencias_created_by_fkey;
alter table public.pendencias
  add constraint pendencias_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

alter table public.solicitacoes
  drop constraint if exists solicitacoes_created_by_fkey;
alter table public.solicitacoes
  add constraint solicitacoes_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

alter table public.registros
  drop constraint if exists registros_created_by_fkey;
alter table public.registros
  add constraint registros_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
