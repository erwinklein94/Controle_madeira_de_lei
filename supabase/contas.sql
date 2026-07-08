-- =====================================================================
-- Página "Contas" do administrador — lista todas as contas com e-mail.
-- Rode no painel do Supabase: SQL Editor -> New query -> cole -> Run
-- Projeto: rgafzmmnpjlrxfjkabsl
-- =====================================================================

-- O e-mail vive em auth.users, que o front-end não lê. Esta função
-- (security definer) entrega a lista completa SOMENTE para admins:
-- para qualquer outro papel ela não retorna linhas.
create or replace function public.admin_list_accounts()
returns table (
  id uuid,
  email text,
  role text,
  nome text,
  fornecedor text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select u.id, u.email::text, p.role, p.nome, p.fornecedor, u.created_at, u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.current_role_name() = 'admin'
  order by u.created_at;
$$;

grant execute on function public.admin_list_accounts() to authenticated;
