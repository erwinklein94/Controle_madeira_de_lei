create table if not exists public.programacao_semanal (
  id uuid primary key default gen_random_uuid(),
  excel_id text not null,
  ano smallint not null check (ano between 2020 and 2100),
  semana smallint not null check (semana between 1 and 53),
  fiscal text not null check (nullif(btrim(fiscal), '') is not null),
  fornecedor text,
  local text not null check (nullif(btrim(local), '') is not null),
  expectativa_pecas bigint not null default 0 check (expectativa_pecas >= 0),
  observacoes text,
  origem_integracao text not null default 'power_automate_excel',
  integrado_em timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programacao_semanal_excel_id_key unique (excel_id),
  constraint programacao_semanal_excel_id_check check (nullif(btrim(excel_id), '') is not null)
);

comment on table public.programacao_semanal is
  'Mural semanal de fiscais sincronizado de uma segunda tabela do Excel Online.';
comment on column public.programacao_semanal.excel_id is
  'Identificador estável e único da linha na tabela de programação do Excel.';
comment on column public.programacao_semanal.expectativa_pecas is
  'Quantidade esperada de peças a serem inspecionadas pelo fiscal naquela programação.';

create index if not exists programacao_semanal_ano_semana_idx
  on public.programacao_semanal (ano desc, semana desc);
create index if not exists programacao_semanal_fiscal_idx
  on public.programacao_semanal (fiscal);
create index if not exists programacao_semanal_fornecedor_idx
  on public.programacao_semanal (fornecedor);
create index if not exists programacao_semanal_local_idx
  on public.programacao_semanal (local);

alter table public.programacao_semanal enable row level security;

drop policy if exists programacao_semanal_select_equipe on public.programacao_semanal;
create policy programacao_semanal_select_equipe
  on public.programacao_semanal
  for select
  to authenticated
  using ((select public.has_full_access()));

revoke all on table public.programacao_semanal from anon;
revoke all on table public.programacao_semanal from authenticated;
grant select on table public.programacao_semanal to authenticated;
grant all on table public.programacao_semanal to service_role;
