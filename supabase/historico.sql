-- =====================================================================
-- Histórico de envios do fornecedor — envios não somem ao serem aceitos.
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

-- Cada envio ganha um status: 'enviada' (aguardando), 'aceita' ou 'recusada'.
alter table public.pendencias
  add column if not exists status text not null default 'enviada';

alter table public.pendencias
  drop constraint if exists pendencias_status_check;

alter table public.pendencias
  add constraint pendencias_status_check
  check (status in ('enviada', 'aceita', 'recusada'));

create index if not exists pendencias_status_idx on public.pendencias (status);
