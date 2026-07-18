-- =====================================================================
-- Comentários — página Comentários (admin) e área do fornecedor.
-- Regras (garantidas por RLS, não só pela interface):
--  - admin lê todos os comentários e pode excluir qualquer um;
--  - fornecedor só lê e cria comentários do PRÓPRIO fornecedor (não vê
--    os demais fornecedores nem seus pedidos);
--  - o autor pode excluir o próprio comentário.
-- Já aplicado no projeto rgafzmmnpjlrxfjkabsl (migrações
-- create_comentarios, grant_comentarios_authenticated e
-- comentarios_fornecedor).
-- =====================================================================

create table if not exists public.comentarios (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  autor_nome  text,
  autor_role  text,
  fornecedor  text not null,
  pedido      text not null,
  texto       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists comentarios_created_idx on public.comentarios (created_at desc);

alter table public.comentarios enable row level security;

drop policy if exists comentarios_select on public.comentarios;
create policy comentarios_select on public.comentarios
  for select using (
    public.current_role_name() in ('editor', 'coordenador', 'analista', 'fiscal')
    or (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor())
  );

drop policy if exists comentarios_insert on public.comentarios;
create policy comentarios_insert on public.comentarios
  for insert with check (
    autor_id = auth.uid()
    and (
      public.current_role_name() in ('editor', 'coordenador', 'analista', 'fiscal')
      or (public.current_role_name() = 'fornecedor' and fornecedor = public.current_fornecedor())
    )
  );

drop policy if exists comentarios_delete on public.comentarios;
create policy comentarios_delete on public.comentarios
  for delete using (
    autor_id = auth.uid()
    or public.current_role_name() in ('editor', 'coordenador', 'analista')
  );

-- Usuários logados podem ler, criar e excluir (RLS restringe o alcance).
grant select, insert, delete on public.comentarios to authenticated;
