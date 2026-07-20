-- Entrada de dados unificada no Report dos fiscais: o perfil fornecedor
-- deixa de inserir envios (pendencias) e solicitações de alteração.
-- A leitura do histórico do fornecedor é preservada.

drop policy if exists pendencias_forn_insert on public.pendencias;
drop policy if exists pendencias_forn_update on public.pendencias;
drop policy if exists pendencias_forn_delete on public.pendencias;

drop policy if exists solicitacoes_forn_insert on public.solicitacoes;
