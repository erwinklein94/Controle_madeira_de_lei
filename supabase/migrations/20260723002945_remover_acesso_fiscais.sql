-- Fiscais/Inspetores deixam de possuir acesso ao site.
-- A operação passa a ser alimentada exclusivamente pelo Excel Online.

drop policy if exists registros_fiscal_select on public.registros;
drop policy if exists report_registros_fiscal_own on public.report_semanal_registros;

drop policy if exists pedidos_insert on public.pedidos;
create policy pedidos_insert on public.pedidos
  for insert to authenticated
  with check ((select public.has_full_access()));

drop policy if exists pedidos_read_scope on public.pedidos;
create policy pedidos_read_scope on public.pedidos
  for select to authenticated
  using (
    (select public.has_full_access())
    or (
      (select public.current_role_name()) = 'fornecedor'
      and fornecedor = (select public.current_fornecedor())
    )
  );

drop policy if exists padroes_read_scope on public.padroes;
create policy padroes_read_scope on public.padroes
  for select to authenticated
  using (
    (select public.has_full_access())
    or (
      (select public.current_role_name()) = 'fornecedor'
      and categoria = 'pedido'
      and fornecedor = (select public.current_fornecedor())
    )
  );

drop policy if exists comentarios_select on public.comentarios;
create policy comentarios_select on public.comentarios
  for select to authenticated
  using (
    (select public.has_full_access())
    or (
      (select public.current_role_name()) = 'fornecedor'
      and fornecedor = (select public.current_fornecedor())
    )
  );

drop policy if exists comentarios_insert on public.comentarios;
create policy comentarios_insert on public.comentarios
  for insert to authenticated
  with check (
    autor_id = (select auth.uid())
    and (
      (select public.has_full_access())
      or (
        (select public.current_role_name()) = 'fornecedor'
        and fornecedor = (select public.current_fornecedor())
      )
    )
  );

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('editor', 'coordenador', 'analista', 'fornecedor'));

comment on column public.profiles.fiscal is
  'Campo legado mantido para auditoria. Fiscais não possuem mais contas no site.';
