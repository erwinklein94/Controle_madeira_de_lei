alter table public.pendencias
  alter column pedido_id drop not null,
  add column if not exists acao_fornecedor text not null default 'enviada';

alter table public.pendencias drop constraint if exists pendencias_status_check;
alter table public.pendencias add constraint pendencias_status_check
  check (status in ('enviada', 'aceita', 'recusada', 'excluida'));

alter table public.pendencias drop constraint if exists pendencias_acao_fornecedor_check;
alter table public.pendencias add constraint pendencias_acao_fornecedor_check
  check (acao_fornecedor in ('enviada', 'alterada', 'excluida'));

drop trigger if exists canonicalize_pedido on public.pendencias;

create or replace function private.normalize_pending_order_reference()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare item public.pedidos%rowtype;
begin
  new.pedido := btrim(new.pedido);
  if nullif(new.pedido, '') is null then raise exception 'Informe o número do pedido.'; end if;

  if new.pedido_id is not null then
    select * into item from public.pedidos
    where id = new.pedido_id and fornecedor = new.fornecedor;
    if not found then raise exception 'O pedido selecionado não pertence a este fornecedor.'; end if;
    new.pedido := item.numero;
    new.vol_pedido := coalesce(item.quantidade_dormentes, new.vol_pedido);
  else
    select * into item from public.pedidos
    where numero = new.pedido and fornecedor = new.fornecedor limit 1;
    if found then
      new.pedido_id := item.id;
      new.pedido := item.numero;
      new.vol_pedido := coalesce(item.quantidade_dormentes, new.vol_pedido);
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.normalize_pending_order_reference() from public;
grant execute on function private.normalize_pending_order_reference() to authenticated;

create trigger canonicalize_pedido
before insert or update of pedido_id, pedido on public.pendencias
for each row execute function private.normalize_pending_order_reference();

create or replace function private.enforce_supplier_pending_update()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if private.current_role_name() = 'fornecedor' then
    if old.created_by is distinct from auth.uid() or old.status <> 'enviada' then
      raise exception 'Você só pode alterar seus próprios envios que aguardam decisão.';
    end if;
    if new.fornecedor is distinct from old.fornecedor
       or new.created_by is distinct from old.created_by
       or new.registro_id is distinct from old.registro_id then
      raise exception 'Não é permitido alterar a autoria deste envio.';
    end if;
    if new.status = 'enviada' and new.acao_fornecedor = 'alterada' then return new; end if;
    if new.status = 'excluida' and new.acao_fornecedor = 'excluida' then return new; end if;
    raise exception 'Alteração de status inválida para fornecedor.';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_supplier_pending_update() from public;
grant execute on function private.enforce_supplier_pending_update() to authenticated;

drop trigger if exists enforce_supplier_update on public.pendencias;
create trigger enforce_supplier_update before update on public.pendencias
for each row execute function private.enforce_supplier_pending_update();

drop policy if exists pendencias_forn_insert on public.pendencias;
create policy pendencias_forn_insert on public.pendencias for insert to authenticated
with check (
  private.current_role_name() = 'fornecedor'
  and fornecedor = private.current_fornecedor()
  and created_by = auth.uid()
  and status = 'enviada'
  and acao_fornecedor = 'enviada'
  and registro_id is null
  and nullif(btrim(pedido), '') is not null
);

drop policy if exists pendencias_forn_update on public.pendencias;
create policy pendencias_forn_update on public.pendencias for update to authenticated
using (
  private.current_role_name() = 'fornecedor'
  and fornecedor = private.current_fornecedor()
  and created_by = auth.uid()
  and status = 'enviada'
)
with check (
  private.current_role_name() = 'fornecedor'
  and fornecedor = private.current_fornecedor()
  and created_by = auth.uid()
  and registro_id is null
  and (
    (status = 'enviada' and acao_fornecedor = 'alterada')
    or (status = 'excluida' and acao_fornecedor = 'excluida')
  )
);

drop policy if exists pendencias_forn_delete on public.pendencias;

create or replace function private.accept_pending(p_pendencia_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  item public.pendencias%rowtype;
  order_item public.pedidos%rowtype;
  new_id uuid;
begin
  if private.current_role_name() not in ('editor', 'coordenador', 'analista') then
    raise exception 'Perfil sem permissão.';
  end if;
  select * into item from public.pendencias where id = p_pendencia_id for update;
  if not found then raise exception 'Informação do fornecedor não encontrada.'; end if;
  if item.registro_id is not null then return item.registro_id; end if;
  if item.status <> 'enviada' then raise exception 'Esta informação já foi processada.'; end if;

  if item.pedido_id is not null then
    select * into order_item from public.pedidos where id = item.pedido_id;
  else
    select * into order_item from public.pedidos
    where numero = item.pedido and fornecedor = item.fornecedor limit 1;
  end if;
  if not found then
    raise exception 'Cadastre primeiro o pedido % para o fornecedor %.', item.pedido, item.fornecedor;
  end if;

  insert into public.registros (
    data_ref, fiscal, fornecedor, local, pedido, pedido_id, vol_pedido,
    vol_fabricar, vol_pronto, vol_inspecionado, vol_liberado,
    vol_transportado, created_by
  ) values (
    item.data_ref, '', order_item.fornecedor, coalesce(order_item.local, ''),
    order_item.numero, order_item.id, coalesce(order_item.quantidade_dormentes, item.vol_pedido),
    item.valor_fabricar, item.vol_fabricado, 0, item.vol_estoque,
    item.vol_transportado, auth.uid()
  ) returning id into new_id;

  update public.pendencias
  set status = 'aceita', registro_id = new_id, pedido_id = order_item.id
  where id = item.id;
  return new_id;
end;
$function$;
