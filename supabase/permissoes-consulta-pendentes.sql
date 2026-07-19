-- Consulta geral do Report: controlada pela interface para os perfis completos.
-- Informacoes pendentes: Fiscal/Inspetor nao possui acesso pela interface nem
-- pela Data API. Editor, Coordenador, Analista e Fornecedor mantem seus fluxos.

alter table public.pendencias enable row level security;
alter table public.solicitacoes enable row level security;

drop policy if exists pendencias_fiscal_select on public.pendencias;
drop policy if exists solicitacoes_fiscal_select on public.solicitacoes;
