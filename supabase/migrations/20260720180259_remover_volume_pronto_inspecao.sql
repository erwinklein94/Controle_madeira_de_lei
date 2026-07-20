-- Remove a etapa intermediaria entre fabricacao e inspecao.
-- As funcoes sao atualizadas antes das colunas para manter os envios operacionais.

create or replace function private.send_weekly_report(p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.report_semanal_registros%rowtype;
  new_id uuid;
  caller_role text := private.current_role_name();
begin
  if caller_role is null or caller_role not in ('editor', 'coordenador', 'analista') then
    raise exception 'Perfil sem permissao para enviar o Report Semanal.';
  end if;

  select * into item
  from public.report_semanal_registros
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Registro do Report Semanal nao encontrado.';
  end if;
  if item.registro_id is not null then return item.registro_id; end if;

  insert into public.registros (
    data_ref, fiscal, fornecedor, local, pedido, vol_pedido, vol_fabricar,
    vol_pronto, vol_inspecionado, vol_liberado, vol_transportado, created_by
  ) values (
    item.data_ref, item.fiscal, item.fornecedor, item.local, item.pedido,
    item.vol_pedido, item.vol_fabricar, item.vol_pronto,
    item.vol_inspecionado, item.vol_liberado, item.vol_transportado,
    (select auth.uid())
  ) returning id into new_id;

  update public.report_semanal_registros
  set registro_id = new_id, enviado_em = now()
  where id = p_report_id;

  return new_id;
end;
$$;

create or replace function private.accept_pending(p_pendencia_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.pendencias%rowtype;
  order_item public.pedidos%rowtype;
  new_id uuid;
begin
  if private.current_role_name() not in ('editor','coordenador','analista') then
    raise exception 'Perfil sem permissao.';
  end if;

  select * into item from public.pendencias where id = p_pendencia_id for update;
  if not found then raise exception 'Pendencia nao encontrada.'; end if;
  if item.registro_id is not null then return item.registro_id; end if;
  if item.status <> 'enviada' then raise exception 'Esta pendencia ja foi processada.'; end if;

  select * into order_item from public.pedidos where id = item.pedido_id;

  insert into public.registros (
    data_ref, fiscal, fornecedor, local, pedido, pedido_id, vol_pedido,
    vol_fabricar, vol_pronto, vol_inspecionado, vol_liberado,
    vol_transportado, created_by
  ) values (
    item.data_ref, '', coalesce(order_item.fornecedor, item.fornecedor),
    coalesce(order_item.local, ''), order_item.numero, order_item.id,
    coalesce(order_item.quantidade_dormentes, item.vol_pedido),
    item.valor_fabricar, item.vol_fabricado, 0, item.vol_estoque,
    item.vol_transportado, auth.uid()
  ) returning id into new_id;

  update public.pendencias
  set status = 'aceita', registro_id = new_id
  where id = item.id;

  return new_id;
end;
$$;

alter table public.registros
  drop constraint if exists registros_volumes_nonnegative;

alter table public.registros
  drop column if exists vol_pronto_insp;

alter table public.registros
  add constraint registros_volumes_nonnegative check (
    vol_pedido >= 0 and vol_fabricar >= 0 and vol_pronto >= 0 and
    vol_inspecionado >= 0 and vol_liberado >= 0 and vol_transportado >= 0
  );

alter table public.report_semanal_registros
  drop column if exists vol_pronto_insp;
