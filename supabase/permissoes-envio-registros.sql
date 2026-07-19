-- Envio dos lancamentos do Report Semanal para Registros.
-- Somente Editor, Coordenador e Analista podem executar esta operacao.

create or replace function private.send_weekly_report(p_report_id uuid)
returns uuid
language plpgsql security definer
set search_path = '' as $$
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
    vol_pronto, vol_pronto_insp, vol_inspecionado, vol_liberado,
    vol_transportado, created_by
  ) values (
    item.data_ref, item.fiscal, item.fornecedor, item.local, item.pedido,
    item.vol_pedido, item.vol_fabricar, item.vol_pronto, item.vol_pronto_insp,
    item.vol_inspecionado, item.vol_liberado, item.vol_transportado,
    (select auth.uid())
  ) returning id into new_id;

  update public.report_semanal_registros
  set registro_id = new_id, enviado_em = now()
  where id = p_report_id;

  return new_id;
end;
$$;

revoke all on function private.send_weekly_report(uuid) from public, anon;
grant execute on function private.send_weekly_report(uuid) to authenticated, service_role;
