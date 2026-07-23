-- =====================================================================
-- Compatibilidade da antiga função de Contas.
-- A função usada pela interface agora é list_accounts(), criada por
-- perfis-acesso.sql com proteção adicional no schema private.
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

-- O e-mail vive em auth.users, que o front-end não lê. Esta função
-- (security definer) entrega a lista completa SOMENTE para acesso completo:
-- para qualquer outro papel ela não retorna linhas.
create or replace function public.admin_list_accounts()
returns table (
  id uuid,
  email text,
  role text,
  nome text,
  fornecedor text,
  fiscal text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text, p.role, p.nome, p.fornecedor, p.fiscal, u.created_at, u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.current_role_name() in ('editor', 'coordenador', 'analista')
  order by u.created_at;
$$;

grant execute on function public.admin_list_accounts() to authenticated;
