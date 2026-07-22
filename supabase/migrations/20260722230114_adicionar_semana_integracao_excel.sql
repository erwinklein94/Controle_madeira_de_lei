alter table public.registros
  add column if not exists semana smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'registros_semana_valida'
      and conrelid = 'public.registros'::regclass
  ) then
    alter table public.registros
      add constraint registros_semana_valida
      check (semana is null or semana between 1 and 53);
  end if;
end
$$;

comment on column public.registros.semana is
  'Número da semana informado pela planilha de controle de estoque.';
