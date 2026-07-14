-- =====================================================================
-- Data de modificação dos registros — alimenta a página Detalhes do
-- fornecedor (lista de registros por data de modificação).
-- Já aplicado no projeto rgafzmmnpjlrxfjkabsl (migração
-- add_updated_at_registros). Guardado aqui como documentação.
-- =====================================================================

alter table public.registros
  add column if not exists updated_at timestamptz not null default now();

-- Registros existentes: assume a data de cadastro como última modificação.
update public.registros set updated_at = created_at;

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists registros_set_updated_at on public.registros;
create trigger registros_set_updated_at
  before update on public.registros
  for each row execute function public.set_updated_at();
