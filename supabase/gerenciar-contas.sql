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

alter table public.comentarios
  alter column autor_id drop not null,
  drop constraint if exists comentarios_autor_id_fkey;
alter table public.comentarios
  add constraint comentarios_autor_id_fkey
  foreign key (autor_id) references auth.users (id) on delete set null;

alter table public.report_semanal_planejamentos
  alter column created_by drop not null,
  drop constraint if exists report_semanal_planejamentos_created_by_fkey;
alter table public.report_semanal_planejamentos
  add constraint report_semanal_planejamentos_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

alter table public.report_semanal_registros
  alter column created_by drop not null,
  drop constraint if exists report_semanal_registros_created_by_fkey;
alter table public.report_semanal_registros
  add constraint report_semanal_registros_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------
-- Permissões do service_role (usado pelas Edge Functions).
-- Neste projeto os papéis não ganham grants automáticos; sem isto as
-- funções create-account/manage-account falham com "permission denied".
-- ---------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
