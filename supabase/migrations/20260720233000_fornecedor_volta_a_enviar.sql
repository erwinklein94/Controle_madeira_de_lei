-- O fornecedor volta a enviar informações (aparecem em "Informações dos
-- Fornecedores"). Reativa a permissão de INSERT em pendencias, restrita
-- ao próprio fornecedor. Leitura já era permitida por pendencias_forn_select.

drop policy if exists pendencias_forn_insert on public.pendencias;
create policy pendencias_forn_insert on public.pendencias
  for insert to authenticated
  with check (
    public.current_role_name() = 'fornecedor'
    and fornecedor = public.current_fornecedor()
  );
