-- Índice de cobertura da chave estrangeira usado ao relacionar ou excluir
-- um registro operacional associado a um item do histórico.
create index if not exists integracao_atualizacoes_itens_registro_idx
  on public.integracao_atualizacoes_itens (registro_id)
  where registro_id is not null;
