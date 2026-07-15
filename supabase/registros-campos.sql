-- =====================================================================
-- Novos campos da página Registros (admin):
--   Data | Fiscal | Fornecedor | Local | Pedido | Volume do Pedido |
--   Volume a ser Fabricado | Volume Fabricado | Volume Inspecionado |
--   Volume em Estoque para Entrega | Volume Transportado
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

alter table public.registros
  add column if not exists data_ref date,
  add column if not exists vol_fabricar numeric not null default 0;

-- Registros antigos: a Data assume a data de cadastro.
update public.registros
  set data_ref = created_at::date
  where data_ref is null;
