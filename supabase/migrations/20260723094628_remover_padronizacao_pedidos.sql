-- O Excel Online passa a ser a única fonte dos dados operacionais dos pedidos.
-- public.pedidos continua existindo apenas para vínculos técnicos e históricos.

revoke insert, update, delete on table public.pedidos from authenticated;
grant select on table public.pedidos to authenticated;
revoke insert, update, delete on table public.padroes from authenticated;
grant select on table public.padroes to authenticated;

drop trigger if exists propagate_pedido_update on public.pedidos;
drop function if exists private.propagate_pedido_update();

alter table public.comentarios alter column pedido_id drop not null;
alter table public.solicitacoes alter column pedido_id drop not null;
alter table public.report_semanal_registros alter column pedido_id drop not null;

create or replace function private.canonicalize_pedido_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  linked_id uuid;
begin
  new.pedido := btrim(new.pedido);
  if nullif(new.pedido, '') is null then
    raise exception 'Informe o número do pedido.';
  end if;

  select id
    into linked_id
    from public.pedidos
   where numero = new.pedido
   limit 1;

  -- O vínculo é opcional fora dos registros importados. Nenhum campo recebido
  -- do Excel ou digitado no aviso é substituído pelo cadastro técnico.
  new.pedido_id := linked_id;
  return new;
end;
$function$;

revoke all on function private.canonicalize_pedido_reference() from public;
grant execute on function private.canonicalize_pedido_reference() to authenticated;

create or replace function private.normalize_pending_order_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  linked_id uuid;
begin
  new.pedido := btrim(new.pedido);
  if nullif(new.pedido, '') is null then
    raise exception 'Informe o número do pedido.';
  end if;

  select id
    into linked_id
    from public.pedidos
   where numero = new.pedido
     and fornecedor = new.fornecedor
   limit 1;

  new.pedido_id := linked_id;
  return new;
end;
$function$;

revoke all on function private.normalize_pending_order_reference() from public;
grant execute on function private.normalize_pending_order_reference() to authenticated;

-- Aceitar um aviso agora significa somente registrar que a equipe o analisou.
-- Registros operacionais são criados ou atualizados exclusivamente pela
-- integração do Excel Online.
create or replace function private.accept_pending(p_pendencia_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  item public.pendencias%rowtype;
begin
  if private.current_role_name() not in ('editor', 'coordenador', 'analista') then
    raise exception 'Perfil sem permissão.';
  end if;

  select *
    into item
    from public.pendencias
   where id = p_pendencia_id
   for update;

  if not found then
    raise exception 'Informação do fornecedor não encontrada.';
  end if;
  if item.status <> 'enviada' then
    raise exception 'Esta informação já foi processada.';
  end if;

  update public.pendencias
     set status = 'aceita'
   where id = item.id;

  return item.id;
end;
$function$;

revoke all on function private.accept_pending(uuid) from public;
grant execute on function private.accept_pending(uuid) to authenticated;
