-- =====================================================================
-- Comentários da equipe — página Comentários do site.
-- Todos os usuários logados leem; cada comentário só pode ser excluído
-- por quem o criou (garantido por RLS, não só pela interface).
-- Já aplicado no projeto rgafzmmnpjlrxfjkabsl (migração create_comentarios).
-- =====================================================================

create table if not exists public.comentarios (
  id          uuid primary key default gen_random_uuid(),
  autor_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  autor_nome  text,
  fornecedor  text not null,
  pedido      text not null,
  texto       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists comentarios_created_idx on public.comentarios (created_at desc);

alter table public.comentarios enable row level security;

drop policy if exists comentarios_select on public.comentarios;
create policy comentarios_select on public.comentarios
  for select using (auth.uid() is not null);

drop policy if exists comentarios_insert on public.comentarios;
create policy comentarios_insert on public.comentarios
  for insert with check (autor_id = auth.uid());

drop policy if exists comentarios_delete on public.comentarios;
create policy comentarios_delete on public.comentarios
  for delete using (autor_id = auth.uid());

-- Usuários logados podem ler, criar e excluir (RLS restringe a exclusão ao autor).
grant select, insert, delete on public.comentarios to authenticated;
