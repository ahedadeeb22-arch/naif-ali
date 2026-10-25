-- Tighten RPC authorization and remove direct access to privileged helpers.

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null or public.current_role() is null then false
    when public.is_admin() then true
    else coalesce(
      (
        select o.allowed
        from public.user_permission_overrides o
        where o.user_id = auth.uid() and o.permission_code = p_permission
      ),
      exists (
        select 1
        from public.profiles p
        join public.role_permissions rp
          on rp.role = p.role and rp.permission_code = p_permission
        where p.user_id = auth.uid() and p.active
      )
    )
  end
$$;

create or replace function public.assert_session(p_permission text default null)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role app_role;
  v_active boolean;
begin
  if v_uid is null then
    raise exception 'الجلسة غير صالحة' using errcode = 'insufficient_privilege';
  end if;

  select role, active into v_role, v_active
  from public.profiles
  where user_id = v_uid;

  if not found or not v_active then
    raise exception 'الحساب غير مفعّل' using errcode = 'insufficient_privilege';
  end if;

  if p_permission is null then
    if v_role not in ('admin', 'worker') then
      raise exception 'هذه العملية مخصصة للإدارة والتشغيل' using errcode = 'insufficient_privilege';
    end if;
  elsif not public.has_permission(p_permission) then
    raise exception 'لا تملك صلاحية تنفيذ هذه العملية' using errcode = 'insufficient_privilege';
  end if;

  return v_uid;
end;
$$;

-- These functions are called from SECURITY DEFINER workflows, not by clients.
revoke all on function public.store_balance(uuid, date) from public, anon, authenticated;
revoke all on function public.supplier_balance(uuid, date) from public, anon, authenticated;
revoke all on function public.check_revision_readiness(uuid) from public, anon, authenticated;
revoke all on function public.reconciliation_report(uuid) from public, anon, authenticated;
revoke all on function public.assert_session(text) from public, anon, authenticated;
revoke all on function public.assert_admin() from public, anon, authenticated;
revoke all on function public.write_audit(text, text, uuid, uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

drop policy if exists sheets_select on public.daily_sheets;
create policy sheets_select on public.daily_sheets
  for select to authenticated
  using (public.is_worker_or_admin());

-- RLS controls rows, but table grants control operations. All operational writes
-- must go through the validated SECURITY DEFINER RPCs.
revoke insert, update, delete on table
  public.night_orders,
  public.night_order_lines,
  public.daily_sheets,
  public.daily_sheet_revisions,
  public.purchase_lines,
  public.purchase_dispositions,
  public.daily_sheet_events,
  public.opening_balances,
  public.payment_vouchers,
  public.journal_entries,
  public.journal_lines,
  public.audit_log
from public, anon, authenticated;