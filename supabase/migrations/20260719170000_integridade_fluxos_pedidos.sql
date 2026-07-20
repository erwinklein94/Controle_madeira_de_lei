-- Fonte única de pedidos, aprovações transacionais, integridade, auditoria,
-- concorrência otimista e suporte a atualizações em tempo real.

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique check (nullif(btrim(numero), '') is not null),
  fornecedor text,
  local text,
  quantidade_dormentes bigint check (quantidade_dormentes is null or quantidade_dormentes > 0),
  ativo boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migra os pedidos completos da antiga categoria de Padronização.
insert into public.pedidos (numero, fornecedor, local, quantidade_dormentes, created_at, updated_at)
select valor, fornecedor, local, quantidade_dormentes, created_at, updated_at
from public.padroes
where categoria = 'pedido'
on conflict (numero) do update set
  fornecedor = coalesce(excluded.fornecedor, public.pedidos.fornecedor),
  local = coalesce(excluded.local, public.pedidos.local),
  quantidade_dormentes = coalesce(excluded.quantidade_dormentes, public.pedidos.quantidade_dormentes);

-- Preserva também números antigos ainda sem cadastro completo.
with referencias as (
  select pedido as numero, fornecedor, local, nullif(vol_pedido, 0)::bigint as quantidade from public.registros
  union all select pedido, fornecedor, null::text, null::bigint from public.pendencias
  union all select pedido, fornecedor, null::text, null::bigint from public.solicitacoes where pedido is not null
  union all select pedido, fornecedor, local, null::bigint from public.report_semanal_planejamentos where pedido is not null
  union all select pedido, fornecedor, local, nullif(vol_pedido, 0)::bigint from public.report_semanal_registros
  union all select pedido, fornecedor, null::text, null::bigint from public.comentarios
), consolidados as (
  select numero, max(fornecedor) fornecedor, max(local) local, max(quantidade) quantidade
  from referencias
  where nullif(btrim(numero), '') is not null
  group by numero
)
insert into public.pedidos (numero, fornecedor, local, quantidade_dormentes)
select numero, fornecedor, local, quantidade from consolidados
on conflict (numero) do update set
  fornecedor = coalesce(public.pedidos.fornecedor, excluded.fornecedor),
  local = coalesce(public.pedidos.local, excluded.local),
  quantidade_dormentes = coalesce(public.pedidos.quantidade_dormentes, excluded.quantidade_dormentes);

alter table public.registros add column if not exists pedido_id uuid;
alter table public.pendencias add column if not exists pedido_id uuid;
alter table public.pendencias add column if not exists registro_id uuid;
alter table public.solicitacoes add column if not exists pedido_id uuid;
alter table public.report_semanal_planejamentos add column if not exists pedido_id uuid;
alter table public.report_semanal_registros add column if not exists pedido_id uuid;
alter table public.comentarios add column if not exists pedido_id uuid;

update public.registros r set pedido_id = p.id from public.pedidos p where r.pedido_id is null and p.numero = r.pedido;
update public.pendencias r set pedido_id = p.id from public.pedidos p where r.pedido_id is null and p.numero = r.pedido;
update public.solicitacoes r set pedido_id = p.id from public.pedidos p where r.pedido_id is null and p.numero = r.pedido;
update public.report_semanal_planejamentos r set pedido_id = p.id from public.pedidos p where r.pedido_id is null and p.numero = r.pedido;
update public.report_semanal_registros r set pedido_id = p.id from public.pedidos p where r.pedido_id is null and p.numero = r.pedido;
update public.comentarios r set pedido_id = p.id from public.pedidos p where r.pedido_id is null and p.numero = r.pedido;

do $$
declare item record;
begin
  for item in select * from (values
    ('registros_pedido_id_fkey', 'public.registros', 'pedido_id'),
    ('pendencias_pedido_id_fkey', 'public.pendencias', 'pedido_id'),
    ('pendencias_registro_id_fkey', 'public.pendencias', 'registro_id'),
    ('solicitacoes_pedido_id_fkey', 'public.solicitacoes', 'pedido_id'),
    ('report_planejamentos_pedido_id_fkey', 'public.report_semanal_planejamentos', 'pedido_id'),
    ('report_registros_pedido_id_fkey', 'public.report_semanal_registros', 'pedido_id'),
    ('comentarios_pedido_id_fkey', 'public.comentarios', 'pedido_id')
  ) v(nome, tabela, coluna)
  loop
    if not exists (select 1 from pg_constraint where conname = item.nome) then
      execute format('alter table %s add constraint %I foreign key (%I) references public.%I(id) on delete restrict',
        item.tabela, item.nome, item.coluna,
        case when item.coluna = 'registro_id' then 'registros' else 'pedidos' end);
    end if;
  end loop;
end $$;

alter table public.registros alter column pedido_id set not null;
alter table public.pendencias alter column pedido_id set not null;
alter table public.solicitacoes alter column pedido_id set not null;
alter table public.report_semanal_registros alter column pedido_id set not null;
alter table public.comentarios alter column pedido_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='pendencias_registro_id_key') then
    alter table public.pendencias add constraint pendencias_registro_id_key unique (registro_id);
  end if;
end $$;

create index if not exists registros_pedido_id_idx on public.registros(pedido_id);
create index if not exists pendencias_pedido_id_idx on public.pendencias(pedido_id);
create index if not exists pendencias_status_created_idx on public.pendencias(status, created_at desc);
create index if not exists solicitacoes_pedido_id_idx on public.solicitacoes(pedido_id);
create index if not exists solicitacoes_status_created_idx on public.solicitacoes(status, created_at desc);
create index if not exists report_planejamentos_pedido_id_idx on public.report_semanal_planejamentos(pedido_id);
create index if not exists report_registros_pedido_id_idx on public.report_semanal_registros(pedido_id);
create index if not exists comentarios_pedido_id_idx on public.comentarios(pedido_id);
create index if not exists pedidos_fornecedor_ativo_idx on public.pedidos(fornecedor, ativo);

-- Impede volumes negativos também fora do Report Semanal.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='registros_volumes_nonnegative') then
    alter table public.registros add constraint registros_volumes_nonnegative check (
      vol_pedido >= 0 and vol_fabricar >= 0 and vol_pronto >= 0 and
      vol_inspecionado >= 0 and vol_liberado >= 0 and vol_transportado >= 0
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='pendencias_volumes_nonnegative') then
    alter table public.pendencias add constraint pendencias_volumes_nonnegative check (
      vol_pedido >= 0 and valor_fabricar >= 0 and vol_fabricado >= 0 and vol_estoque >= 0 and vol_transportado >= 0
    );
  end if;
  if not exists (select 1 from pg_constraint where conname='solicitacoes_volumes_nonnegative') then
    alter table public.solicitacoes add constraint solicitacoes_volumes_nonnegative check (
      vol_pedido_novo >= 0 and valor_fabricar_novo >= 0 and vol_fabricado_novo >= 0 and
      vol_estoque_novo >= 0 and vol_transportado_novo >= 0
    );
  end if;
end $$;

-- Controle de versão para evitar sobrescrita silenciosa entre usuários.
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.pendencias add column if not exists updated_at timestamptz not null default now();
alter table public.solicitacoes add column if not exists updated_at timestamptz not null default now();
alter table public.report_semanal_planejamentos add column if not exists updated_at timestamptz not null default now();
alter table public.report_semanal_registros add column if not exists updated_at timestamptz not null default now();
alter table public.comentarios add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare tabela text;
begin
  foreach tabela in array array['pedidos','profiles','registros','padroes','pendencias','solicitacoes','report_semanal_planejamentos','report_semanal_registros','comentarios']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', tabela);
    execute format('drop trigger if exists %I on public.%I', tabela || '_set_updated_at', tabela);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', tabela);
  end loop;
end $$;

-- Mantém os campos legados sincronizados, mas pedidos passa a ser a fonte única.
create or replace function private.canonicalize_pedido_reference()
returns trigger language plpgsql security definer set search_path = '' as $$
declare item public.pedidos%rowtype;
begin
  if tg_op = 'UPDATE' and new.pedido is distinct from old.pedido then
    select * into item from public.pedidos where numero = new.pedido;
    new.pedido_id = item.id;
  elsif new.pedido_id is not null then
    select * into item from public.pedidos where id = new.pedido_id;
  else
    select * into item from public.pedidos where numero = new.pedido;
    new.pedido_id = item.id;
  end if;
  if not found then raise exception 'Pedido não cadastrado: %', new.pedido; end if;

  new.pedido = item.numero;
  if tg_table_name = 'registros' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.local = coalesce(item.local, new.local);
    new.vol_pedido = coalesce(item.quantidade_dormentes, new.vol_pedido);
  elsif tg_table_name = 'pendencias' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.vol_pedido = coalesce(item.quantidade_dormentes, new.vol_pedido);
  elsif tg_table_name = 'solicitacoes' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.vol_pedido_novo = coalesce(item.quantidade_dormentes, new.vol_pedido_novo);
  elsif tg_table_name = 'report_semanal_planejamentos' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.local = coalesce(item.local, new.local);
  elsif tg_table_name = 'report_semanal_registros' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
    new.local = coalesce(item.local, new.local);
    new.vol_pedido = coalesce(item.quantidade_dormentes, new.vol_pedido);
  elsif tg_table_name = 'comentarios' then
    new.fornecedor = coalesce(item.fornecedor, new.fornecedor);
  end if;
  return new;
end $$;

do $$
declare tabela text;
begin
  foreach tabela in array array['registros','pendencias','solicitacoes','report_semanal_planejamentos','report_semanal_registros','comentarios']
  loop
    execute format('drop trigger if exists canonicalize_pedido on public.%I', tabela);
    execute format('create trigger canonicalize_pedido before insert or update of pedido_id, pedido on public.%I for each row execute function private.canonicalize_pedido_reference()', tabela);
  end loop;
end $$;

create or replace function private.propagate_pedido_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.numero, old.fornecedor, old.local, old.quantidade_dormentes)
     is distinct from (new.numero, new.fornecedor, new.local, new.quantidade_dormentes) then
    update public.registros set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      local=coalesce(new.local, local), vol_pedido=coalesce(new.quantidade_dormentes, vol_pedido) where pedido_id=new.id;
    update public.pendencias set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      vol_pedido=coalesce(new.quantidade_dormentes, vol_pedido) where pedido_id=new.id;
    update public.solicitacoes set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      vol_pedido_novo=coalesce(new.quantidade_dormentes, vol_pedido_novo) where pedido_id=new.id;
    update public.report_semanal_planejamentos set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      local=coalesce(new.local, local) where pedido_id=new.id;
    update public.report_semanal_registros set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor),
      local=coalesce(new.local, local), vol_pedido=coalesce(new.quantidade_dormentes, vol_pedido) where pedido_id=new.id;
    update public.comentarios set pedido=new.numero, fornecedor=coalesce(new.fornecedor, fornecedor) where pedido_id=new.id;
  end if;
  return new;
end $$;

drop trigger if exists propagate_pedido_update on public.pedidos;
create trigger propagate_pedido_update after update on public.pedidos
for each row execute function private.propagate_pedido_update();

-- Aprovações curtas, atômicas, idempotentes e vinculadas ao registro exato.
create or replace function private.accept_pending(p_pendencia_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare item public.pendencias%rowtype; order_item public.pedidos%rowtype; new_id uuid;
begin
  if private.current_role_name() not in ('editor','coordenador','analista') then raise exception 'Perfil sem permissão.'; end if;
  select * into item from public.pendencias where id=p_pendencia_id for update;
  if not found then raise exception 'Pendência não encontrada.'; end if;
  if item.registro_id is not null then return item.registro_id; end if;
  if item.status <> 'enviada' then raise exception 'Esta pendência já foi processada.'; end if;
  select * into order_item from public.pedidos where id=item.pedido_id;
  insert into public.registros(data_ref,fiscal,fornecedor,local,pedido,pedido_id,vol_pedido,vol_fabricar,vol_pronto,vol_inspecionado,vol_liberado,vol_transportado,created_by)
  values(item.data_ref,'',coalesce(order_item.fornecedor,item.fornecedor),coalesce(order_item.local,''),order_item.numero,order_item.id,
    coalesce(order_item.quantidade_dormentes,item.vol_pedido),item.valor_fabricar,item.vol_fabricado,0,item.vol_estoque,item.vol_transportado,auth.uid())
  returning id into new_id;
  update public.pendencias set status='aceita', registro_id=new_id where id=item.id;
  return new_id;
end $$;

create or replace function private.approve_change_request(p_solicitacao_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare req public.solicitacoes%rowtype; pending public.pendencias%rowtype;
begin
  if private.current_role_name() not in ('editor','coordenador','analista') then raise exception 'Perfil sem permissão.'; end if;
  select * into req from public.solicitacoes where id=p_solicitacao_id for update;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  if req.status = 'aprovada' then
    select registro_id into pending.registro_id from public.pendencias where id=req.pendencia_id;
    return pending.registro_id;
  end if;
  if req.status <> 'pendente' then raise exception 'Esta solicitação já foi processada.'; end if;
  select * into pending from public.pendencias where id=req.pendencia_id for update;
  if not found then raise exception 'Pendência vinculada não encontrada.'; end if;
  update public.pendencias set valor_fabricar=req.valor_fabricar_novo, vol_fabricado=req.vol_fabricado_novo,
    vol_estoque=req.vol_estoque_novo, vol_transportado=req.vol_transportado_novo where id=pending.id;
  if pending.registro_id is not null then
    update public.registros set vol_fabricar=req.valor_fabricar_novo, vol_pronto=req.vol_fabricado_novo,
      vol_liberado=req.vol_estoque_novo, vol_transportado=req.vol_transportado_novo where id=pending.registro_id;
  end if;
  update public.solicitacoes set status='aprovada' where id=req.id;
  return pending.registro_id;
end $$;

create or replace function public.aceitar_pendencia(p_pendencia_id uuid)
returns uuid language sql set search_path = '' as $$ select private.accept_pending(p_pendencia_id) $$;
create or replace function public.aprovar_solicitacao(p_solicitacao_id uuid)
returns uuid language sql set search_path = '' as $$ select private.approve_change_request(p_solicitacao_id) $$;

revoke all on function private.accept_pending(uuid) from public, anon;
revoke all on function private.approve_change_request(uuid) from public, anon;
grant execute on function private.accept_pending(uuid), private.approve_change_request(uuid) to authenticated, service_role;
revoke all on function public.aceitar_pendencia(uuid), public.aprovar_solicitacao(uuid) from public, anon;
grant execute on function public.aceitar_pendencia(uuid), public.aprovar_solicitacao(uuid) to authenticated, service_role;

-- Auditoria: cobre pedidos e perfis; chamadas administrativas sem JWT continuam
-- registradas manualmente pelas Edge Functions para manter o ator correto.
create or replace function private.capture_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_role_value text; actor_name_value text; actor_email_value text;
  headers jsonb := '{}'::jsonb; before_row jsonb; after_row jsonb; target_row jsonb;
begin
  if tg_op='UPDATE' and old is not distinct from new then return new; end if;
  if actor is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  select p.role,p.nome,u.email::text into actor_role_value,actor_name_value,actor_email_value
    from public.profiles p left join auth.users u on u.id=p.id where p.id=actor;
  begin headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  exception when others then headers:='{}'::jsonb; end;
  before_row:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  after_row:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  target_row:=coalesce(after_row,before_row,'{}'::jsonb);
  insert into public.audit_logs(actor_id,actor_email,actor_role,actor_name,action,entity,record_id,old_data,new_data,ip_address,user_agent)
  values(actor,actor_email_value,case when actor_role_value='admin' then 'editor' else actor_role_value end,actor_name_value,
    tg_op,tg_table_name,target_row->>'id',before_row,after_row,split_part(coalesce(headers->>'x-forwarded-for',''),',',1),headers->>'user-agent');
  if tg_op='DELETE' then return old; end if; return new;
end $$;

do $$
declare tabela text;
begin
  foreach tabela in array array['pedidos','profiles'] loop
    execute format('drop trigger if exists audit_changes on public.%I', tabela);
    execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function private.capture_audit()', tabela);
  end loop;
end $$;

-- Perfis só são alterados pelas Edge Functions, que já criam a auditoria com ator.
drop policy if exists profiles_full_access on public.profiles;

alter table public.pedidos enable row level security;
drop policy if exists pedidos_read_scope on public.pedidos;
drop policy if exists pedidos_full_insert on public.pedidos;
drop policy if exists pedidos_full_update on public.pedidos;
create policy pedidos_read_scope on public.pedidos for select to authenticated using (
  (select public.current_role_name()) in ('editor','coordenador','analista','fiscal') or
  ((select public.current_role_name())='fornecedor' and fornecedor=(select public.current_fornecedor()))
);
create policy pedidos_full_insert on public.pedidos for insert to authenticated with check ((select public.has_full_access()));
create policy pedidos_full_update on public.pedidos for update to authenticated
  using ((select public.has_full_access())) with check ((select public.has_full_access()));
grant select,insert,update on public.pedidos to authenticated;
revoke delete on public.pedidos from authenticated, anon;

-- A categoria antiga deixa de ser uma segunda fonte de pedidos.
delete from public.padroes where categoria='pedido';
alter table public.padroes drop constraint if exists padroes_pedido_detalhes_check;
alter table public.padroes drop constraint if exists padroes_categoria_check;
alter table public.padroes add constraint padroes_categoria_check check (categoria in ('fiscal','fornecedor','local'));

-- Habilita os eventos que o cliente usa para recarregar a tela ativa.
do $$
declare tabela text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach tabela in array array['pedidos','profiles','registros','padroes','pendencias','solicitacoes','report_semanal_planejamentos','report_semanal_registros','comentarios'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tabela) then
        execute format('alter publication supabase_realtime add table public.%I', tabela);
      end if;
    end loop;
  end if;
end $$;
