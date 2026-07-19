-- =====================================================================
-- NOVOS PERFIS + MATRIZ DE ACESSO + AUDITORIA
-- Execute depois dos demais scripts do projeto, inclusive report-semanal.sql.
-- Projeto esperado pelo frontend: rgafzmmnpjlrxfjkabsl
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Perfis da aplicacao
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists fiscal text;
alter table public.profiles drop constraint if exists profiles_role_check;

-- O antigo administrador passa a ser Editor.
update public.profiles set role = 'editor' where role = 'admin';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('editor', 'coordenador', 'analista', 'fiscal', 'fornecedor'));

-- Excluir uma conta nao apaga o historico operacional criado por ela.
alter table public.comentarios alter column autor_id drop not null;
alter table public.comentarios drop constraint if exists comentarios_autor_id_fkey;
alter table public.comentarios add constraint comentarios_autor_id_fkey
  foreign key (autor_id) references auth.users (id) on delete set null;
alter table public.report_semanal_planejamentos alter column created_by drop not null;
alter table public.report_semanal_planejamentos drop constraint if exists report_semanal_planejamentos_created_by_fkey;
alter table public.report_semanal_planejamentos add constraint report_semanal_planejamentos_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;
alter table public.report_semanal_registros alter column created_by drop not null;
alter table public.report_semanal_registros drop constraint if exists report_semanal_registros_created_by_fkey;
alter table public.report_semanal_registros add constraint report_semanal_registros_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- Preenche os perfis solicitados quando os usuarios ja existem no Auth.
insert into public.profiles (id, role, nome, fornecedor, fiscal)
select u.id, x.role, x.nome, null, x.fiscal
from auth.users u
join (values
  ('erwin.klein@ext.rumolog.com', 'editor', 'Erwin Klein', null::text),
  ('marcio.martins@rumolog.com', 'coordenador', 'Marcio Martins', null::text),
  ('nayara.sarracine@rumolog.com', 'analista', 'Nayara Sarracine', null::text),
  ('walter.silva@ext.rumolog.com', 'fiscal', 'Walter Silva', 'Walter'),
  ('ivan.desouza@ext.rumolog.com', 'fiscal', 'Ivan de Souza', 'Ivan Souza')
) as x(email, role, nome, fiscal) on lower(u.email) = x.email
on conflict (id) do update set
  role = excluded.role,
  nome = excluded.nome,
  fornecedor = null,
  fiscal = excluded.fiscal;

-- Helpers privilegiados ficam fora do schema exposto. Os wrappers publicos
-- sao security invoker e nao possuem privilegios proprios.
create or replace function private.current_role_name()
returns text
language sql stable security definer
set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.current_fornecedor()
returns text
language sql stable security definer
set search_path = '' as $$
  select p.fornecedor from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.current_fiscal()
returns text
language sql stable security definer
set search_path = '' as $$
  select p.fiscal from public.profiles p where p.id = (select auth.uid())
$$;

revoke all on function private.current_role_name() from public, anon;
revoke all on function private.current_fornecedor() from public, anon;
revoke all on function private.current_fiscal() from public, anon;
grant execute on function private.current_role_name() to authenticated, service_role;
grant execute on function private.current_fornecedor() to authenticated, service_role;
grant execute on function private.current_fiscal() to authenticated, service_role;

create or replace function public.current_role_name()
returns text language sql stable security invoker set search_path = '' as $$
  select private.current_role_name()
$$;
create or replace function public.current_fornecedor()
returns text language sql stable security invoker set search_path = '' as $$
  select private.current_fornecedor()
$$;
create or replace function public.current_fiscal()
returns text language sql stable security invoker set search_path = '' as $$
  select private.current_fiscal()
$$;
create or replace function public.has_full_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(private.current_role_name() in ('editor', 'coordenador', 'analista'), false)
$$;
create or replace function public.is_fiscal()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(private.current_role_name() = 'fiscal', false)
$$;

revoke all on function public.current_role_name() from public, anon;
revoke all on function public.current_fornecedor() from public, anon;
revoke all on function public.current_fiscal() from public, anon;
revoke all on function public.has_full_access() from public, anon;
revoke all on function public.is_fiscal() from public, anon;
grant execute on function public.current_role_name() to authenticated, service_role;
grant execute on function public.current_fornecedor() to authenticated, service_role;
grant execute on function public.current_fiscal() to authenticated, service_role;
grant execute on function public.has_full_access() to authenticated, service_role;
grant execute on function public.is_fiscal() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. RLS por area
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
drop policy if exists profiles_full_access on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_full_access()));
create policy profiles_full_access on public.profiles for all to authenticated
  using ((select public.has_full_access()))
  with check ((select public.has_full_access()));

-- Registros: acesso completo altera; Fiscal apenas le; Fornecedor le os seus.
alter table public.registros enable row level security;
drop policy if exists registros_admin_all on public.registros;
drop policy if exists registros_full_access on public.registros;
drop policy if exists registros_fiscal_select on public.registros;
drop policy if exists registros_fornecedor_select on public.registros;
drop policy if exists registros_fornecedor_insert on public.registros;
drop policy if exists registros_fornecedor_update on public.registros;
drop policy if exists registros_fornecedor_delete on public.registros;
create policy registros_full_access on public.registros for all to authenticated
  using ((select public.has_full_access())) with check ((select public.has_full_access()));
create policy registros_fiscal_select on public.registros for select to authenticated
  using ((select public.is_fiscal()));
create policy registros_fornecedor_select on public.registros for select to authenticated
  using (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor());

-- Pendencias e solicitacoes: equipe completa decide; Fiscal nao possui acesso;
-- Fornecedor mantem o fluxo proprio ja existente.
drop policy if exists pendencias_admin_all on public.pendencias;
drop policy if exists pendencias_full_access on public.pendencias;
drop policy if exists pendencias_fiscal_select on public.pendencias;
drop policy if exists pendencias_forn_select on public.pendencias;
drop policy if exists pendencias_forn_insert on public.pendencias;
drop policy if exists pendencias_forn_update on public.pendencias;
drop policy if exists pendencias_forn_delete on public.pendencias;
create policy pendencias_full_access on public.pendencias for all to authenticated
  using ((select public.has_full_access())) with check ((select public.has_full_access()));
create policy pendencias_forn_select on public.pendencias for select to authenticated
  using (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor());
create policy pendencias_forn_insert on public.pendencias for insert to authenticated
  with check (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor());

drop policy if exists solicitacoes_admin_all on public.solicitacoes;
drop policy if exists solicitacoes_full_access on public.solicitacoes;
drop policy if exists solicitacoes_fiscal_select on public.solicitacoes;
drop policy if exists solicitacoes_forn_select on public.solicitacoes;
drop policy if exists solicitacoes_forn_insert on public.solicitacoes;
create policy solicitacoes_full_access on public.solicitacoes for all to authenticated
  using ((select public.has_full_access())) with check ((select public.has_full_access()));
create policy solicitacoes_forn_select on public.solicitacoes for select to authenticated
  using (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor());
create policy solicitacoes_forn_insert on public.solicitacoes for insert to authenticated
  with check (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor());

-- Padronizacao: Fiscal/Inspetor consulta, mas somente Editor, Coordenador e
-- Analista podem cadastrar, editar ou excluir. Fornecedor nao recebe acesso
-- direto a esta area.
drop policy if exists padroes_select on public.padroes;
drop policy if exists padroes_admin_all on public.padroes;
drop policy if exists padroes_full_access on public.padroes;
drop policy if exists padroes_team_all on public.padroes;
drop policy if exists padroes_read_scope on public.padroes;
drop policy if exists padroes_full_insert on public.padroes;
drop policy if exists padroes_full_update on public.padroes;
drop policy if exists padroes_full_delete on public.padroes;
create policy padroes_read_scope on public.padroes for select to authenticated
  using (
    (select public.current_role_name()) in ('editor', 'coordenador', 'analista', 'fiscal')
    or (
      (select public.current_role_name()) = 'fornecedor'
      and categoria = 'pedido'
      and fornecedor = (select public.current_fornecedor())
    )
  );
create policy padroes_full_insert on public.padroes for insert to authenticated
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));
create policy padroes_full_update on public.padroes for update to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'))
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));
create policy padroes_full_delete on public.padroes for delete to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

-- Comentarios: a equipe ve todos e publica; fornecedor fica limitado ao seu.
drop policy if exists comentarios_select on public.comentarios;
drop policy if exists comentarios_insert on public.comentarios;
drop policy if exists comentarios_delete on public.comentarios;
create policy comentarios_select on public.comentarios for select to authenticated using (
  public.current_role_name() in ('editor', 'coordenador', 'analista', 'fiscal')
  or (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor())
);
create policy comentarios_insert on public.comentarios for insert to authenticated with check (
  autor_id = (select auth.uid()) and (
    public.current_role_name() in ('editor', 'coordenador', 'analista', 'fiscal')
    or (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor())
  )
);
create policy comentarios_delete on public.comentarios for delete to authenticated using (
  autor_id = (select auth.uid()) or (select public.has_full_access())
);

-- Report Semanal: acesso completo gerencia tudo. Fiscal apenas consulta o
-- proprio planejamento e continua registrando atividades no proprio report.
drop policy if exists report_planejamentos_admin_all on public.report_semanal_planejamentos;
drop policy if exists report_planejamentos_full_access on public.report_semanal_planejamentos;
drop policy if exists report_planejamentos_fiscal_own on public.report_semanal_planejamentos;
drop policy if exists report_planejamentos_fiscal_select on public.report_semanal_planejamentos;
create policy report_planejamentos_full_access on public.report_semanal_planejamentos for all to authenticated
  using ((select public.has_full_access())) with check ((select public.has_full_access()));
create policy report_planejamentos_fiscal_select on public.report_semanal_planejamentos for select to authenticated
  using ((select public.is_fiscal()) and fiscal = (select public.current_fiscal()));

drop policy if exists report_registros_admin_all on public.report_semanal_registros;
drop policy if exists report_registros_full_access on public.report_semanal_registros;
drop policy if exists report_registros_fiscal_own on public.report_semanal_registros;
create policy report_registros_full_access on public.report_semanal_registros for all to authenticated
  using ((select public.has_full_access())) with check ((select public.has_full_access()));
create policy report_registros_fiscal_own on public.report_semanal_registros for all to authenticated
  using (public.is_fiscal() and fiscal = public.current_fiscal())
  with check (public.is_fiscal() and fiscal = public.current_fiscal());

-- ---------------------------------------------------------------------
-- 3. Auditoria imutavel
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           bigint generated by default as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  actor_role   text,
  actor_name   text,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  entity       text not null,
  record_id    text,
  old_data     jsonb,
  new_data     jsonb,
  summary      text,
  ip_address   text,
  user_agent   text
);
create index if not exists audit_logs_occurred_at_idx on public.audit_logs (occurred_at desc);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id, occurred_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity, occurred_at desc);

alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_full_select on public.audit_logs;
create policy audit_logs_full_select on public.audit_logs for select to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador'));

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
grant select, insert on public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;

create or replace function private.capture_audit()
returns trigger
language plpgsql security definer
set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  actor_role_value text;
  actor_name_value text;
  actor_email_value text;
  headers jsonb := '{}'::jsonb;
  before_row jsonb;
  after_row jsonb;
  target_row jsonb;
begin
  if tg_op = 'UPDATE' and old is not distinct from new then return new; end if;

  if actor is not null then
    select p.role, p.nome, u.email::text
      into actor_role_value, actor_name_value, actor_email_value
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.id = actor;
  end if;

  begin
    headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    headers := '{}'::jsonb;
  end;

  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_row := coalesce(after_row, before_row, '{}'::jsonb);

  insert into public.audit_logs (
    actor_id, actor_email, actor_role, actor_name, action, entity, record_id,
    old_data, new_data, ip_address, user_agent
  ) values (
    actor,
    actor_email_value,
    case when actor_role_value = 'admin' then 'editor' else actor_role_value end,
    actor_name_value,
    tg_op,
    tg_table_name,
    target_row ->> 'id',
    before_row,
    after_row,
    split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1),
    headers ->> 'user-agent'
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.capture_audit() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'registros', 'pendencias', 'solicitacoes', 'comentarios', 'padroes',
    'report_semanal_planejamentos', 'report_semanal_registros'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists audit_changes on public.%I', table_name);
      execute format(
        'create trigger audit_changes after insert or update or delete on public.%I for each row execute function private.capture_audit()',
        table_name
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Listagem segura de contas
-- ---------------------------------------------------------------------
create or replace function private.list_accounts()
returns table (
  id uuid, email text, role text, nome text, fornecedor text, fiscal text,
  created_at timestamptz, last_sign_in_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, p.role, p.nome, p.fornecedor, p.fiscal,
         u.created_at, u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where private.current_role_name() in ('editor', 'coordenador', 'analista')
  order by u.created_at
$$;
revoke all on function private.list_accounts() from public, anon;
grant execute on function private.list_accounts() to authenticated, service_role;

create or replace function public.list_accounts()
returns table (
  id uuid, email text, role text, nome text, fornecedor text, fiscal text,
  created_at timestamptz, last_sign_in_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select * from private.list_accounts()
$$;
revoke all on function public.list_accounts() from public, anon;
grant execute on function public.list_accounts() to authenticated;

-- Remove o endpoint antigo depois que o frontend passa a usar list_accounts.
drop function if exists public.admin_list_accounts();

-- ---------------------------------------------------------------------
-- 5. Envio controlado do Report para Registros
-- Somente Editor, Coordenador e Analista podem copiar um lancamento do Report
-- para Registros. A operacao e idempotente.
-- ---------------------------------------------------------------------
create or replace function private.send_weekly_report(p_report_id uuid)
returns uuid
language plpgsql security definer
set search_path = '' as $$
declare
  item public.report_semanal_registros%rowtype;
  new_id uuid;
  caller_role text := private.current_role_name();
begin
  if caller_role is null or caller_role not in ('editor', 'coordenador', 'analista') then
    raise exception 'Perfil sem permissao para enviar o Report Semanal.';
  end if;

  select * into item from public.report_semanal_registros where id = p_report_id for update;
  if not found then raise exception 'Registro do Report Semanal nao encontrado.'; end if;
  if item.registro_id is not null then return item.registro_id; end if;

  insert into public.registros (
    data_ref, fiscal, fornecedor, local, pedido, vol_pedido, vol_fabricar,
    vol_pronto, vol_pronto_insp, vol_inspecionado, vol_liberado,
    vol_transportado, created_by
  ) values (
    item.data_ref, item.fiscal, item.fornecedor, item.local, item.pedido,
    item.vol_pedido, item.vol_fabricar, item.vol_pronto, item.vol_pronto_insp,
    item.vol_inspecionado, item.vol_liberado, item.vol_transportado,
    (select auth.uid())
  ) returning id into new_id;

  update public.report_semanal_registros
    set registro_id = new_id, enviado_em = now()
  where id = p_report_id;
  return new_id;
end;
$$;
revoke all on function private.send_weekly_report(uuid) from public, anon;
grant execute on function private.send_weekly_report(uuid) to authenticated, service_role;

create or replace function public.enviar_report_semanal_para_registros(p_report_id uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.send_weekly_report(p_report_id)
$$;
revoke all on function public.enviar_report_semanal_para_registros(uuid) from public, anon;
grant execute on function public.enviar_report_semanal_para_registros(uuid) to authenticated;

-- Grants explicitos para a Data API.
grant select on public.profiles, public.registros, public.pendencias,
  public.solicitacoes, public.comentarios, public.padroes,
  public.report_semanal_planejamentos, public.report_semanal_registros
to authenticated;
-- Profiles so mudam pelas Edge Functions, que tambem registram a auditoria
-- da conta; usuarios autenticados nao podem alterar perfis pela Data API.
revoke insert, update, delete on public.profiles from authenticated;
grant insert, update, delete on public.registros,
  public.pendencias, public.solicitacoes, public.comentarios, public.padroes,
  public.report_semanal_planejamentos, public.report_semanal_registros
to authenticated;

-- A funcao de event trigger e interna ao banco e nao deve ficar exposta
-- como RPC pela Data API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

-- Indices para as chaves estrangeiras usadas nos filtros e nas exclusoes.
create index if not exists comentarios_autor_id_idx
  on public.comentarios (autor_id);
create index if not exists pendencias_created_by_idx
  on public.pendencias (created_by);
create index if not exists registros_created_by_idx
  on public.registros (created_by);
create index if not exists report_planejamentos_created_by_idx
  on public.report_semanal_planejamentos (created_by);
create index if not exists report_registros_created_by_idx
  on public.report_semanal_registros (created_by);
create index if not exists solicitacoes_created_by_idx
  on public.solicitacoes (created_by);
create index if not exists solicitacoes_pendencia_id_idx
  on public.solicitacoes (pendencia_id);
