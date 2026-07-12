-- =====================================================================
-- Padronização — listas de opções para os formulários do site.
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

create table if not exists public.padroes (
  id         uuid primary key default gen_random_uuid(),
  categoria  text not null check (categoria in ('fiscal', 'fornecedor', 'local', 'pedido')),
  valor      text not null,
  created_at timestamptz not null default now(),
  unique (categoria, valor)
);

alter table public.padroes enable row level security;

-- Qualquer usuário logado lê as opções; só o admin gerencia.
drop policy if exists padroes_select on public.padroes;
create policy padroes_select on public.padroes
  for select using (auth.uid() is not null);

drop policy if exists padroes_admin_all on public.padroes;
create policy padroes_admin_all on public.padroes
  for all using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

grant select, insert, update, delete on public.padroes to authenticated;

-- ---------------------------------------------------------------------
-- Valores iniciais
-- ---------------------------------------------------------------------
insert into public.padroes (categoria, valor) values
  ('fiscal', 'Walter'),
  ('fiscal', 'Ivan Souza'),
  ('fornecedor', 'Três Guris'),
  ('fornecedor', 'Pandolfi'),
  ('fornecedor', 'Granoski'),
  ('local', 'Enéias Marques'),
  ('local', 'Marcelândia'),
  ('local', 'Itauba')
on conflict (categoria, valor) do nothing;

-- Pedidos: importa todos os que já existem nos registros e nos envios.
insert into public.padroes (categoria, valor)
  select distinct 'pedido', pedido from public.registros
  where pedido is not null and pedido <> ''
on conflict (categoria, valor) do nothing;

insert into public.padroes (categoria, valor)
  select distinct 'pedido', pedido from public.pendencias
  where pedido is not null and pedido <> ''
on conflict (categoria, valor) do nothing;
