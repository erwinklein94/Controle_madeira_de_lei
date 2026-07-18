-- =====================================================================
-- Padronização — listas de opções para os formulários do site.
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

create table if not exists public.padroes (
  id                    uuid primary key default gen_random_uuid(),
  categoria             text not null check (categoria in ('fiscal', 'fornecedor', 'local', 'pedido')),
  valor                 text not null,
  fornecedor            text,
  local                 text,
  quantidade_dormentes  bigint,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (categoria, valor)
);

alter table public.padroes
  add column if not exists fornecedor text,
  add column if not exists local text,
  add column if not exists quantidade_dormentes bigint,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'padroes_pedido_detalhes_check'
      and conrelid = 'public.padroes'::regclass
  ) then
    alter table public.padroes add constraint padroes_pedido_detalhes_check check (
      (categoria <> 'pedido' and fornecedor is null and local is null and quantidade_dormentes is null)
      or (categoria = 'pedido' and (
        (fornecedor is null and local is null and quantidade_dormentes is null)
        or (nullif(btrim(fornecedor), '') is not null
          and nullif(btrim(local), '') is not null
          and quantidade_dormentes > 0)
      ))
    );
  end if;
end
$$;

create index if not exists padroes_pedido_fornecedor_idx
  on public.padroes (fornecedor, valor)
  where categoria = 'pedido' and fornecedor is not null;

drop trigger if exists padroes_set_updated_at on public.padroes;
create trigger padroes_set_updated_at before update on public.padroes
  for each row execute function public.set_updated_at();

alter table public.padroes enable row level security;

-- A equipe consulta; somente Editor, Coordenador e Analista podem alterar.
drop policy if exists padroes_select on public.padroes;
drop policy if exists padroes_admin_all on public.padroes;
drop policy if exists padroes_team_all on public.padroes;
drop policy if exists padroes_read_scope on public.padroes;
drop policy if exists padroes_full_insert on public.padroes;
drop policy if exists padroes_full_update on public.padroes;
drop policy if exists padroes_full_delete on public.padroes;
create policy padroes_read_scope on public.padroes for select to authenticated
  using (
    (select public.current_role_name()) in ('editor', 'coordenador', 'analista', 'fiscal')
    or ((select public.current_role_name()) = 'fornecedor'
      and categoria = 'pedido'
      and fornecedor = (select public.current_fornecedor()))
  );
create policy padroes_full_insert on public.padroes for insert to authenticated
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));
create policy padroes_full_update on public.padroes for update to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'))
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));
create policy padroes_full_delete on public.padroes for delete to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

grant select, insert, update, delete on public.padroes to authenticated;

-- ---------------------------------------------------------------------
-- Valores iniciais
-- ---------------------------------------------------------------------
insert into public.padroes (categoria, valor) values
  ('fiscal', 'Walter'),
  ('fiscal', 'Ivan Souza'),
  ('fornecedor', 'Três Guri'),
  ('fornecedor', 'Pandolfi'),
  ('fornecedor', 'Granoski'),
  ('local', 'Enéas Marquês'),
  ('local', 'Marcelândia'),
  ('local', 'Itaúba')
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
