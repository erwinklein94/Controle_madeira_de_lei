-- Remove definitivamente o planejamento de expectativas do Report Semanal.

create or replace function private.canonicalize_pedido_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare item public.pedidos%rowtype;
begin
  if tg_op = 'UPDATE' and new.pedido is distinct from old.pedido then
    select * into item from public.pedidos where numero = new.pedido;
    new.pedido_id = item.id;
  elsif new.pedido_id is not null then
    select * into item from public.pedidos where id = new.pedido_id;
  else
    select * into item from public.pedidos where numero = new.pedido;
    new.pedido_id = item.id;
  end if;
  if not found then raise exception 'Pedido não cadastrado: %', new.pedido; end if;

  new.pedido = item.numero;
  if tg_table_name = 'registros' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.local = coalesce(item.local, new.local);
    new.vol_pedido = coalesce(item.quantidade_dormentes, new.vol_pedido);
  elsif tg_table_name = 'pendencias' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.vol_pedido = coalesce(item.quantidade_dormentes, new.vol_pedido);
  elsif tg_table_name = 'solicitacoes' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.vol_pedido_novo = coalesce(item.quantidade_dormentes, new.vol_pedido_novo);
  elsif tg_table_name = 'report_semanal_registros' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.local = coalesce(item.local, new.local);
    new.vol_pedido = coalesce(item.quantidade_dormentes, new.vol_pedido);
  elsif tg_table_name = 'comentarios' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
  end if;
  return new;
end
$$;

create or replace function private.propagate_pedido_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.numero, old.fornecedor, old.local, old.quantidade_dormentes)
     is distinct from (new.numero, new.fornecedor, new.local, new.quantidade_dormentes) then
    update public.registros set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      local=coalesce(new.local, local), vol_pedido=coalesce(new.quantidade_dormentes, vol_pedido) where pedido_id=new.id;
    update public.pendencias set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      vol_pedido=coalesce(new.quantidade_dormentes, vol_pedido) where pedido_id=new.id;
    update public.solicitacoes set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      vol_pedido_novo=coalesce(new.quantidade_dormentes, vol_pedido_novo) where pedido_id=new.id;
    update public.report_semanal_registros set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      local=coalesce(new.local, local), vol_pedido=coalesce(new.quantidade_dormentes, vol_pedido) where pedido_id=new.id;
    update public.comentarios set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor) where pedido_id=new.id;
  end if;
  return new;
end
$$;

delete from public.audit_logs
where entity = 'report_semanal_planejamentos'
   or old_data ? 'expectativa_inspecionado'
   or old_data ? 'expectativa_entregue'
   or new_data ? 'expectativa_inspecionado'
   or new_data ? 'expectativa_entregue';

drop table if exists public.report_semanal_planejamentos;
