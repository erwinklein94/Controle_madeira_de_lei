-- =====================================================================
-- Detalhes dos pedidos na Padronizacao.
-- Acrescenta fornecedor, local e quantidade de dormentes ao cadastro ja
-- existente em public.padroes e restringe a edicao aos perfis completos.
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

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
    alter table public.padroes
      add constraint padroes_pedido_detalhes_check check (
        (categoria <> 'pedido' and fornecedor is null and local is null and quantidade_dormentes is null)
        or
        (categoria = 'pedido' and (
          (fornecedor is null and local is null and quantidade_dormentes is null)
          or
          (nullif(btrim(fornecedor), '') is not null
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

alter table public.padroes enable row level security;

drop trigger if exists padroes_set_updated_at on public.padroes;
create trigger padroes_set_updated_at
  before update on public.padroes
  for each row execute function public.set_updated_at();

drop policy if exists padroes_select on public.padroes;
drop policy if exists padroes_admin_all on public.padroes;
drop policy if exists padroes_team_all on public.padroes;
drop policy if exists padroes_read_scope on public.padroes;
drop policy if exists padroes_full_insert on public.padroes;
drop policy if exists padroes_full_update on public.padroes;
drop policy if exists padroes_full_delete on public.padroes;

create policy padroes_read_scope on public.padroes
  for select to authenticated
  using (
    (select public.current_role_name()) in ('editor', 'coordenador', 'analista', 'fiscal')
    or (
      (select public.current_role_name()) = 'fornecedor'
      and categoria = 'pedido'
      and fornecedor = (select public.current_fornecedor())
    )
  );

create policy padroes_full_insert on public.padroes
  for insert to authenticated
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

create policy padroes_full_update on public.padroes
  for update to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'))
  with check ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

create policy padroes_full_delete on public.padroes
  for delete to authenticated
  using ((select public.current_role_name()) in ('editor', 'coordenador', 'analista'));

grant select, insert, update, delete on public.padroes to authenticated;

-- Importa somente pedidos cujos dados concordam em todo o historico.
with fontes as (
  select pedido, fornecedor, local, vol_pedido
  from public.registros
  where pedido is not null and pedido <> '' and vol_pedido > 0
  union all
  select pedido, fornecedor, local, vol_pedido
  from public.report_semanal_registros
  where pedido is not null and pedido <> '' and vol_pedido > 0
), coerentes as (
  select
    pedido,
    min(fornecedor) as fornecedor,
    min(local) as local,
    min(vol_pedido)::bigint as quantidade_dormentes
  from fontes
  group by pedido
  having count(distinct fornecedor) = 1
    and count(distinct local) = 1
    and count(distinct vol_pedido) = 1
    and bool_and(vol_pedido = trunc(vol_pedido))
)
update public.padroes as p
set fornecedor = c.fornecedor,
    local = c.local,
    quantidade_dormentes = c.quantidade_dormentes,
    updated_at = now()
from coerentes as c
where p.categoria = 'pedido'
  and p.valor = c.pedido
  and p.fornecedor is null
  and p.local is null
  and p.quantidade_dormentes is null;
