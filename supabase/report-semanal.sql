-- =====================================================================
-- Report Semanal - planejamento e apontamentos diarios dos fiscais.
-- Execute no SQL Editor do projeto Supabase antes de usar a nova pagina.
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

create table if not exists public.report_semanal_planejamentos (
  id                       uuid primary key default gen_random_uuid(),
  semana_inicio            date not null,
  fiscal                   text not null,
  fornecedor               text not null,
  local                    text not null,
  pedido                   text,
  expectativa_inspecionado numeric not null default 0 check (expectativa_inspecionado >= 0),
  expectativa_entregue     numeric not null default 0 check (expectativa_entregue >= 0),
  observacoes              text,
  created_by               uuid not null default auth.uid() references auth.users (id),
  created_at               timestamptz not null default now(),
  constraint report_planejamento_semana_segunda
    check (extract(isodow from semana_inicio) = 1)
);

create index if not exists report_planejamento_semana_fiscal_idx
  on public.report_semanal_planejamentos (semana_inicio, fiscal);

create table if not exists public.report_semanal_registros (
  id                uuid primary key default gen_random_uuid(),
  semana_inicio     date not null,
  data_ref          date not null,
  fiscal            text not null,
  fornecedor        text not null,
  local             text not null,
  pedido            text not null,
  vol_pedido        numeric not null default 0 check (vol_pedido >= 0),
  vol_fabricar      numeric not null default 0 check (vol_fabricar >= 0),
  vol_pronto        numeric not null default 0 check (vol_pronto >= 0),
  vol_pronto_insp   numeric not null default 0 check (vol_pronto_insp >= 0),
  vol_inspecionado  numeric not null default 0 check (vol_inspecionado >= 0),
  vol_liberado      numeric not null default 0 check (vol_liberado >= 0),
  vol_transportado  numeric not null default 0 check (vol_transportado >= 0),
  registro_id       uuid unique references public.registros (id) on delete set null,
  enviado_em        timestamptz,
  created_by        uuid not null default auth.uid() references auth.users (id),
  created_at        timestamptz not null default now(),
  constraint report_registro_semana_segunda
    check (extract(isodow from semana_inicio) = 1),
  constraint report_registro_data_na_semana
    check (data_ref between semana_inicio and (semana_inicio + 6))
);

create index if not exists report_registro_semana_fiscal_idx
  on public.report_semanal_registros (semana_inicio, fiscal, data_ref);

create index if not exists report_registro_fornecedor_idx
  on public.report_semanal_registros (fornecedor);

alter table public.report_semanal_planejamentos enable row level security;
alter table public.report_semanal_registros enable row level security;

drop policy if exists report_planejamentos_admin_all on public.report_semanal_planejamentos;
create policy report_planejamentos_admin_all
  on public.report_semanal_planejamentos
  for all
  to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'))
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

drop policy if exists report_planejamentos_fiscal_own on public.report_semanal_planejamentos;
create policy report_planejamentos_fiscal_own on public.report_semanal_planejamentos
  for all to authenticated
  using (public.current_role_name() = 'fiscal' and fiscal = public.current_fiscal())
  with check (public.current_role_name() = 'fiscal' and fiscal = public.current_fiscal());

drop policy if exists report_registros_admin_all on public.report_semanal_registros;
create policy report_registros_admin_all
  on public.report_semanal_registros
  for all
  to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'))
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

drop policy if exists report_registros_fiscal_own on public.report_semanal_registros;
create policy report_registros_fiscal_own on public.report_semanal_registros
  for all to authenticated
  using (public.current_role_name() = 'fiscal' and fiscal = public.current_fiscal())
  with check (public.current_role_name() = 'fiscal' and fiscal = public.current_fiscal());

-- As tabelas sao usadas pelo frontend via supabase-js/Data API.
grant select, insert, update, delete on public.report_semanal_planejamentos to authenticated;
grant select, insert, update, delete on public.report_semanal_registros to authenticated;

-- Envio atomico e idempotente: cria o registro oficial e marca o item do
-- report na mesma transacao. Uma segunda chamada devolve o mesmo registro.
create or replace function public.enviar_report_semanal_para_registros(p_report_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  item public.report_semanal_registros%rowtype;
  novo_registro_id uuid;
begin
  if public.current_role_name() not in ('editor', 'coordenador', 'analista') then
    raise exception 'Perfil sem permissao para enviar o report semanal.';
  end if;

  select * into item
  from public.report_semanal_registros
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Registro do report semanal nao encontrado.';
  end if;

  if item.registro_id is not null then
    return item.registro_id;
  end if;

  insert into public.registros (
    data_ref, fiscal, fornecedor, local, pedido,
    vol_pedido, vol_fabricar, vol_pronto, vol_pronto_insp,
    vol_inspecionado, vol_liberado, vol_transportado, created_by
  ) values (
    item.data_ref, item.fiscal, item.fornecedor, item.local, item.pedido,
    item.vol_pedido, item.vol_fabricar, item.vol_pronto, item.vol_pronto_insp,
    item.vol_inspecionado, item.vol_liberado, item.vol_transportado,
    (select auth.uid())
  )
  returning id into novo_registro_id;

  update public.report_semanal_registros
  set registro_id = novo_registro_id,
      enviado_em = now()
  where id = p_report_id;

  return novo_registro_id;
end;
$$;

revoke all on function public.enviar_report_semanal_para_registros(uuid) from public;
revoke all on function public.enviar_report_semanal_para_registros(uuid) from anon;
grant execute on function public.enviar_report_semanal_para_registros(uuid) to authenticated;

-- Garante os dois fiscais iniciais. Novos fiscais cadastrados na pagina de
-- Padronizacao aparecerao automaticamente no Report Semanal.
insert into public.padroes (categoria, valor) values
  ('fiscal', 'Walter'),
  ('fiscal', 'Ivan Souza')
on conflict (categoria, valor) do nothing;
