-- =====================================================================
-- Nova coluna dos Registros: "Volume pronto a ser Inspecionado"
-- (entre Volume Fabricado e Volume Inspecionado).
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

alter table public.registros
  add column if not exists vol_pronto_insp numeric not null default 0;
