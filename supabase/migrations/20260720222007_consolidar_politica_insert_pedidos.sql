-- Mantém uma única política de inserção para reduzir o custo do RLS.

drop policy if exists pedidos_full_insert on public.pedidos;
drop policy if exists pedidos_fiscal_insert on public.pedidos;
drop policy if exists pedidos_insert on public.pedidos;

create policy pedidos_insert
on public.pedidos
for insert
to authenticated
with check (
  (select public.has_full_access())
  or (
    (select public.is_fiscal())
    and created_by = (select auth.uid())
    and ativo is true
    and nullif(btrim(numero), '') is not null
    and quantidade_dormentes > 0
    and exists (
      select 1
      from public.padroes as p
      where p.categoria = 'fornecedor'
        and p.valor = pedidos.fornecedor
    )
    and exists (
      select 1
      from public.padroes as p
      where p.categoria = 'local'
        and p.valor = pedidos.local
    )
  )
);
