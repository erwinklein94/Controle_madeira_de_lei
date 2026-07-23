-- Histórico operacional da sincronização Excel Online -> Power Automate -> site.
-- Cada chamada da Edge Function gera um item. As chamadas da mesma hora são
-- agrupadas automaticamente, sem exigir uma alteração imediata no fluxo atual.

create table if not exists public.integracao_atualizacoes (
  id uuid primary key default gen_random_uuid(),
  chave_execucao text not null unique,
  janela_inicio timestamptz not null,
  iniciada_em timestamptz not null default clock_timestamp(),
  finalizada_em timestamptz not null default clock_timestamp(),
  recebidos integer not null default 0 check (recebidos >= 0),
  novos integer not null default 0 check (novos >= 0),
  alterados integer not null default 0 check (alterados >= 0),
  sem_alteracao integer not null default 0 check (sem_alteracao >= 0),
  ignorados integer not null default 0 check (ignorados >= 0),
  erros integer not null default 0 check (erros >= 0),
  created_at timestamptz not null default now()
);

comment on table public.integracao_atualizacoes is
  'Resumo de cada execução horária da integração do Excel Online.';
comment on column public.integracao_atualizacoes.chave_execucao is
  'Identificador enviado pelo Power Automate ou, na ausência dele, a hora UTC da recepção.';

create table if not exists public.integracao_atualizacoes_itens (
  id uuid primary key default gen_random_uuid(),
  atualizacao_id uuid not null
    references public.integracao_atualizacoes (id) on delete cascade,
  recebido_em timestamptz not null default clock_timestamp(),
  excel_id text,
  registro_id uuid references public.registros (id) on delete set null,
  pedido text,
  fornecedor text,
  fiscal text,
  acao text not null check (
    acao in ('created', 'updated', 'unchanged', 'skipped', 'error')
  ),
  campos_alterados jsonb not null default '{}'::jsonb,
  dados jsonb not null default '{}'::jsonb,
  mensagem text
);

comment on table public.integracao_atualizacoes_itens is
  'Resultado de cada linha recebida pela Edge Function durante uma atualização.';
comment on column public.integracao_atualizacoes_itens.campos_alterados is
  'Campos operacionais alterados, com rótulo e valores anterior e novo.';

create index if not exists integracao_atualizacoes_janela_idx
  on public.integracao_atualizacoes (janela_inicio desc);
create index if not exists integracao_atualizacoes_itens_atualizacao_idx
  on public.integracao_atualizacoes_itens (atualizacao_id, recebido_em);
create index if not exists integracao_atualizacoes_itens_excel_idx
  on public.integracao_atualizacoes_itens (excel_id)
  where excel_id is not null;

alter table public.integracao_atualizacoes enable row level security;
alter table public.integracao_atualizacoes_itens enable row level security;

drop policy if exists integracao_atualizacoes_equipe_select
  on public.integracao_atualizacoes;
create policy integracao_atualizacoes_equipe_select
  on public.integracao_atualizacoes
  for select
  to authenticated
  using ((select public.has_full_access()));

drop policy if exists integracao_atualizacoes_itens_equipe_select
  on public.integracao_atualizacoes_itens;
create policy integracao_atualizacoes_itens_equipe_select
  on public.integracao_atualizacoes_itens
  for select
  to authenticated
  using ((select public.has_full_access()));

revoke all on table public.integracao_atualizacoes from anon;
revoke all on table public.integracao_atualizacoes_itens from anon;
grant select on table public.integracao_atualizacoes to authenticated;
grant select on table public.integracao_atualizacoes_itens to authenticated;
grant select, insert, update, delete on table public.integracao_atualizacoes to service_role;
grant select, insert, update, delete on table public.integracao_atualizacoes_itens to service_role;

create or replace function public.registrar_atualizacao_integracao(
  p_acao text,
  p_excel_id text default null,
  p_registro_id uuid default null,
  p_pedido text default null,
  p_fornecedor text default null,
  p_fiscal text default null,
  p_campos_alterados jsonb default '{}'::jsonb,
  p_dados jsonb default '{}'::jsonb,
  p_mensagem text default null,
  p_chave_execucao text default null,
  p_recebido_em timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_atualizacao_id uuid;
  v_janela_inicio timestamptz;
  v_chave_execucao text;
begin
  if p_acao not in ('created', 'updated', 'unchanged', 'skipped', 'error') then
    raise exception 'Ação de integração inválida: %', p_acao;
  end if;

  v_janela_inicio := date_trunc('hour', p_recebido_em);
  v_chave_execucao := coalesce(
    nullif(btrim(p_chave_execucao), ''),
    to_char(v_janela_inicio at time zone 'UTC', 'YYYYMMDDHH24')
  );

  insert into public.integracao_atualizacoes (
    chave_execucao,
    janela_inicio,
    iniciada_em,
    finalizada_em,
    recebidos,
    novos,
    alterados,
    sem_alteracao,
    ignorados,
    erros
  )
  values (
    v_chave_execucao,
    v_janela_inicio,
    p_recebido_em,
    p_recebido_em,
    1,
    case when p_acao = 'created' then 1 else 0 end,
    case when p_acao = 'updated' then 1 else 0 end,
    case when p_acao = 'unchanged' then 1 else 0 end,
    case when p_acao = 'skipped' then 1 else 0 end,
    case when p_acao = 'error' then 1 else 0 end
  )
  on conflict (chave_execucao) do update
  set
    iniciada_em = least(
      public.integracao_atualizacoes.iniciada_em,
      excluded.iniciada_em
    ),
    finalizada_em = greatest(
      public.integracao_atualizacoes.finalizada_em,
      excluded.finalizada_em
    ),
    recebidos = public.integracao_atualizacoes.recebidos + 1,
    novos = public.integracao_atualizacoes.novos + excluded.novos,
    alterados = public.integracao_atualizacoes.alterados + excluded.alterados,
    sem_alteracao = public.integracao_atualizacoes.sem_alteracao + excluded.sem_alteracao,
    ignorados = public.integracao_atualizacoes.ignorados + excluded.ignorados,
    erros = public.integracao_atualizacoes.erros + excluded.erros
  returning id into v_atualizacao_id;

  insert into public.integracao_atualizacoes_itens (
    atualizacao_id,
    recebido_em,
    excel_id,
    registro_id,
    pedido,
    fornecedor,
    fiscal,
    acao,
    campos_alterados,
    dados,
    mensagem
  )
  values (
    v_atualizacao_id,
    p_recebido_em,
    nullif(btrim(p_excel_id), ''),
    p_registro_id,
    nullif(btrim(p_pedido), ''),
    nullif(btrim(p_fornecedor), ''),
    nullif(btrim(p_fiscal), ''),
    p_acao,
    coalesce(p_campos_alterados, '{}'::jsonb),
    coalesce(p_dados, '{}'::jsonb),
    nullif(btrim(p_mensagem), '')
  );

  return v_atualizacao_id;
end;
$$;

revoke all on function public.registrar_atualizacao_integracao(
  text, text, uuid, text, text, text, jsonb, jsonb, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.registrar_atualizacao_integracao(
  text, text, uuid, text, text, text, jsonb, jsonb, text, text, timestamptz
) to service_role;
