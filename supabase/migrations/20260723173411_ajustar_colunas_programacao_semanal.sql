alter table public.programacao_semanal
  rename column expectativa_pecas to qtde_pecas;

alter table public.programacao_semanal
  add column pedido text,
  add column data_inicio date,
  add column data_fim date,
  add column status text;

alter table public.programacao_semanal
  drop column local;

alter table public.programacao_semanal
  alter column fornecedor set not null,
  alter column pedido set not null,
  alter column data_inicio set not null,
  alter column data_fim set not null,
  alter column status set not null;

alter table public.programacao_semanal
  add constraint programacao_semanal_fornecedor_preenchido_check
    check (btrim(fornecedor) <> ''),
  add constraint programacao_semanal_pedido_preenchido_check
    check (btrim(pedido) <> ''),
  add constraint programacao_semanal_status_preenchido_check
    check (btrim(status) <> ''),
  add constraint programacao_semanal_periodo_check
    check (data_fim >= data_inicio);

drop index if exists public.programacao_semanal_local_idx;
create index programacao_semanal_pedido_idx
  on public.programacao_semanal (pedido);
create index programacao_semanal_status_idx
  on public.programacao_semanal (status);
create index programacao_semanal_periodo_idx
  on public.programacao_semanal (data_inicio, data_fim);

comment on table public.programacao_semanal is
  'Programação semanal sincronizada da segunda tabela do Excel Online.';
comment on column public.programacao_semanal.excel_id is
  'Valor da coluna ID do Excel; identificador único usado no upsert.';
comment on column public.programacao_semanal.ano is
  'Ano ISO calculado internamente a partir de Data Início.';
comment on column public.programacao_semanal.semana is
  'Semana ISO calculada internamente a partir de Data Início.';
comment on column public.programacao_semanal.fornecedor is
  'Fornecedor informado na programação.';
comment on column public.programacao_semanal.pedido is
  'Número do pedido informado na programação.';
comment on column public.programacao_semanal.fiscal is
  'Fiscal responsável pela programação.';
comment on column public.programacao_semanal.data_inicio is
  'Data inicial da programação.';
comment on column public.programacao_semanal.data_fim is
  'Data final da programação.';
comment on column public.programacao_semanal.qtde_pecas is
  'Quantidade de peças prevista para inspeção.';
comment on column public.programacao_semanal.status is
  'Status informado na programação.';
comment on column public.programacao_semanal.observacoes is
  'Observações opcionais da programação.';
