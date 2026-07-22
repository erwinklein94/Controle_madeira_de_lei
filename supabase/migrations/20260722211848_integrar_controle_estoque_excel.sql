-- Identifica de forma idempotente os registros enviados pelo Excel/Power Automate.
-- As linhas já existentes no site permanecem com excel_id nulo.
alter table public.registros
  add column if not exists excel_id text,
  add column if not exists origem_integracao text,
  add column if not exists integrado_em timestamptz;

comment on column public.registros.excel_id is
  'Identificador estável e único da linha de origem no Excel Online.';
comment on column public.registros.origem_integracao is
  'Sistema que criou ou atualizou o registro; ex.: power_automate_excel.';
comment on column public.registros.integrado_em is
  'Data e hora da última recepção pela integração.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'registros_excel_id_nao_vazio'
      and conrelid = 'public.registros'::regclass
  ) then
    alter table public.registros
      add constraint registros_excel_id_nao_vazio
      check (excel_id is null or nullif(btrim(excel_id), '') is not null);
  end if;
end
$$;

-- O índice permite vários registros criados pelo site (Postgres não considera
-- valores nulos iguais) e é inferido pelo ON CONFLICT (excel_id) do upsert.
create unique index if not exists registros_excel_id_unique_idx
  on public.registros (excel_id);

create index if not exists registros_origem_integrado_em_idx
  on public.registros (origem_integracao, integrado_em desc)
  where origem_integracao is not null;

-- A tabela já é consumida pelo frontend autenticado. A Edge Function usa uma
-- chave secreta somente no servidor e, portanto, não precisa de uma policy
-- pública de INSERT/UPDATE. O service role ignora RLS de forma intencional.
alter table public.registros enable row level security;
revoke all on table public.registros from anon;
grant select, insert, update, delete on table public.registros to authenticated;
