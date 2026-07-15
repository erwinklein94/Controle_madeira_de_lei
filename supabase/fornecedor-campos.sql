-- =====================================================================
-- Novos campos do formulário do fornecedor:
--   Data | Pedido | Volume a ser Fabricado | Volume Fabricado |
--   Volume em estoque para entrega | Volume Transportado
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

alter table public.pendencias
  add column if not exists data_ref date,
  add column if not exists valor_fabricar numeric not null default 0,
  add column if not exists vol_fabricado numeric not null default 0,
  add column if not exists vol_estoque numeric not null default 0;

-- Solicitações de alteração passam a propor os novos campos.
alter table public.solicitacoes
  add column if not exists valor_fabricar_novo numeric not null default 0,
  add column if not exists vol_fabricado_novo numeric not null default 0,
  add column if not exists vol_estoque_novo numeric not null default 0;

-- Aproveita os envios antigos: o "Volume do pedido" de antes vira o
-- "Volume a ser Fabricado", e a data do envio vira a Data.
update public.pendencias
  set valor_fabricar = vol_pedido
  where valor_fabricar = 0 and vol_pedido <> 0;

update public.pendencias
  set data_ref = created_at::date
  where data_ref is null;
