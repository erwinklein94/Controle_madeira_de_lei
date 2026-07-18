-- Destinos e expectativas do Report Semanal.
-- Editor, Coordenador e Analista gerenciam; Fiscal/Inspetor apenas consulta
-- o planejamento vinculado ao proprio perfil.

alter table public.report_semanal_planejamentos enable row level security;

drop policy if exists report_planejamentos_admin_all on public.report_semanal_planejamentos;
drop policy if exists report_planejamentos_full_access on public.report_semanal_planejamentos;
drop policy if exists report_planejamentos_fiscal_own on public.report_semanal_planejamentos;
drop policy if exists report_planejamentos_fiscal_select on public.report_semanal_planejamentos;

create policy report_planejamentos_full_access
  on public.report_semanal_planejamentos
  for all to authenticated
  using ((select public.has_full_access()))
  with check ((select public.has_full_access()));

create policy report_planejamentos_fiscal_select
  on public.report_semanal_planejamentos
  for select to authenticated
  using ((select public.is_fiscal()) and fiscal = (select public.current_fiscal()));
