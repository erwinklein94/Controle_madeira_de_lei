drop policy if exists pendencias_forn_insert on public.pendencias;
create policy pendencias_forn_insert on public.pendencias
for insert to authenticated
with check (
  private.current_role_name() = 'fornecedor'
  and fornecedor = private.current_fornecedor()
  and created_by = (select auth.uid())
  and status = 'enviada'
  and acao_fornecedor = 'enviada'
  and registro_id is null
  and nullif(btrim(pedido), '') is not null
);

drop policy if exists pendencias_forn_update on public.pendencias;
create policy pendencias_forn_update on public.pendencias
for update to authenticated
using (
  private.current_role_name() = 'fornecedor'
  and fornecedor = private.current_fornecedor()
  and created_by = (select auth.uid())
  and status = 'enviada'
)
with check (
  private.current_role_name() = 'fornecedor'
  and fornecedor = private.current_fornecedor()
  and created_by = (select auth.uid())
  and registro_id is null
  and (
    (status = 'enviada' and acao_fornecedor = 'alterada')
    or (status = 'excluida' and acao_fornecedor = 'excluida')
  )
);
