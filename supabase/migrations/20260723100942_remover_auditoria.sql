-- Desativa definitivamente a auditoria do aplicativo sem apagar o histórico.
-- A tabela permanece somente como arquivo interno, sem acesso pela aplicação.

do $$
declare
  item record;
begin
  for item in
    select
      table_namespace.nspname as table_schema,
      table_class.relname as table_name,
      trigger_data.tgname as trigger_name
    from pg_trigger as trigger_data
    join pg_class as table_class
      on table_class.oid = trigger_data.tgrelid
    join pg_namespace as table_namespace
      on table_namespace.oid = table_class.relnamespace
    join pg_proc as trigger_function
      on trigger_function.oid = trigger_data.tgfoid
    join pg_namespace as function_namespace
      on function_namespace.oid = trigger_function.pronamespace
    where not trigger_data.tgisinternal
      and function_namespace.nspname = 'private'
      and trigger_function.proname = 'capture_audit'
  loop
    execute format(
      'drop trigger if exists %I on %I.%I',
      item.trigger_name,
      item.table_schema,
      item.table_name
    );
  end loop;
end
$$;

drop function if exists private.capture_audit();

drop policy if exists audit_logs_full_select on public.audit_logs;
revoke all on table public.audit_logs from public, anon, authenticated, service_role;
revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated, service_role;

comment on table public.audit_logs is
  'Arquivo histórico inativo. A aplicação não cria nem consulta novos eventos.';
