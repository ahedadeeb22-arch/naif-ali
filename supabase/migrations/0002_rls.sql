-- ============================================================================
-- 0002_rls.sql — Row Level Security (deny-by-default)
-- الأمان في القاعدة ليس بديلًا عن التحقق الخادمي، بل طبقة ثانية.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- دوال مساعدة (SECURITY DEFINER مع search_path ثابت)
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p
  where p.user_id = auth.uid() and p.active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_role() = 'admin', false)
$$;

create or replace function public.is_worker_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_role() in ('admin','worker'), false)
$$;

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

create or replace function public.owns_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.store_memberships m
    join public.profiles p on p.user_id = m.user_id and p.active
    where m.user_id = auth.uid()
      and m.store_id = p_store_id
      and m.active
      and p.role = 'store_owner'
  )
$$;

create or replace function public.my_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.store_id
  from public.store_memberships m
  join public.profiles p on p.user_id = m.user_id and p.active
  where m.user_id = auth.uid() and m.active and p.role = 'store_owner'
$$;

grant execute on function public.current_role() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.is_worker_or_admin() to authenticated, anon;
grant execute on function public.has_permission(text) to authenticated, anon;
grant execute on function public.owns_store(uuid) to authenticated, anon;
grant execute on function public.my_store_ids() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- تفعيل RLS على كل الجداول المكشوفة
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.stores enable row level security;
alter table public.store_memberships enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.accounting_accounts enable row level security;
alter table public.night_orders enable row level security;
alter table public.night_order_lines enable row level security;
alter table public.daily_sheets enable row level security;
alter table public.daily_sheet_revisions enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.purchase_dispositions enable row level security;
alter table public.daily_sheet_events enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.opening_balances enable row level security;
alter table public.payment_vouchers enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- منع رفع الصلاحية الذاتية: المستخدم لا يحدّث دوره إلى admin بنفسه.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'تغيير الدور يتطلب صلاحية مدير' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- permissions / role_permissions / overrides
-- ---------------------------------------------------------------------------
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);
drop policy if exists permissions_admin_write on public.permissions;
create policy permissions_admin_write on public.permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
drop policy if exists role_permissions_admin on public.role_permissions;
create policy role_permissions_admin on public.role_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists overrides_select on public.user_permission_overrides;
create policy overrides_select on public.user_permission_overrides for select to authenticated
  using (public.is_admin() or user_id = auth.uid());
-- لا يمكن منح صلاحية لصاحب بقالة أبدًا.
drop policy if exists overrides_admin_write on public.user_permission_overrides;
create policy overrides_admin_write on public.user_permission_overrides for all to authenticated
  using (public.is_admin())
  with check (
    public.is_admin()
    and exists (select 1 from public.profiles p where p.user_id = user_id and p.role <> 'store_owner')
  );

-- ---------------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------------
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores for select to authenticated
  using (
    public.is_worker_or_admin()
    or (active and id in (select public.my_store_ids()))
  );

drop policy if exists stores_admin_write on public.stores;
create policy stores_admin_write on public.stores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- store_memberships
-- ---------------------------------------------------------------------------
drop policy if exists memberships_select on public.store_memberships;
create policy memberships_select on public.store_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists memberships_admin_write on public.store_memberships;
create policy memberships_admin_write on public.store_memberships for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- suppliers / products / accounts
-- ---------------------------------------------------------------------------
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (public.is_worker_or_admin());

drop policy if exists suppliers_admin_write on public.suppliers;
create policy suppliers_admin_write on public.suppliers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated
  using (public.is_worker_or_admin() or public.current_role() = 'store_owner'); -- store owner needs catalog names for statement

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists accounts_select on public.accounting_accounts;
create policy accounts_select on public.accounting_accounts for select to authenticated
  using (public.is_admin());

drop policy if exists accounts_admin_write on public.accounting_accounts;
create policy accounts_admin_write on public.accounting_accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- طلبات الليل: worker/admin يكتبون، صاحب البقالة لا يرى الطلبات مطلقًا
-- ---------------------------------------------------------------------------
drop policy if exists night_orders_select on public.night_orders;
create policy night_orders_select on public.night_orders for select to authenticated
  using (public.is_worker_or_admin());

drop policy if exists night_orders_write on public.night_orders;
create policy night_orders_write on public.night_orders for all to authenticated
  using (public.is_worker_or_admin()) with check (public.is_worker_or_admin());

drop policy if exists night_order_lines_select on public.night_order_lines;
create policy night_order_lines_select on public.night_order_lines for select to authenticated
  using (public.is_worker_or_admin());

drop policy if exists night_order_lines_write on public.night_order_lines;
create policy night_order_lines_write on public.night_order_lines for all to authenticated
  using (public.is_worker_or_admin()) with check (public.is_worker_or_admin());

-- ---------------------------------------------------------------------------
-- يومية/إصدارات/سطور: worker يقرأ ويكتب المسودات فقط. لا كتابة لصاحب البقالة.
-- ---------------------------------------------------------------------------
drop policy if exists sheets_select on public.daily_sheets;
create policy sheets_select on public.daily_sheets for select to authenticated
  using (
    public.is_worker_or_admin()
    or (status in ('posted','closed') and exists (
      select 1 from public.store_memberships m
      where m.user_id = auth.uid() and m.active
    ))
  );

drop policy if exists sheets_write on public.daily_sheets;
create policy sheets_write on public.daily_sheets for all to authenticated
  using (public.is_worker_or_admin()) with check (public.is_worker_or_admin());

drop policy if exists revisions_select on public.daily_sheet_revisions;
create policy revisions_select on public.daily_sheet_revisions for select to authenticated
  using (public.is_worker_or_admin());

drop policy if exists revisions_write on public.daily_sheet_revisions;
create policy revisions_write on public.daily_sheet_revisions for all to authenticated
  using (public.is_worker_or_admin()) with check (public.is_worker_or_admin());

drop policy if exists purchase_lines_select on public.purchase_lines;
create policy purchase_lines_select on public.purchase_lines for select to authenticated
  using (public.is_worker_or_admin());

drop policy if exists purchase_lines_write on public.purchase_lines;
create policy purchase_lines_write on public.purchase_lines for all to authenticated
  using (public.is_worker_or_admin()) with check (public.is_worker_or_admin());

-- ملاحظة: منع كتابة worker إلى revision non-draft مضمون في RPC (0003) وفي grant:
-- لا يوجد grant مباشر لـ authenticated على tables مالية؛ كل تعديل يمر بـRPC.

drop policy if exists dispositions_select on public.purchase_dispositions;
create policy dispositions_select on public.purchase_dispositions for select to authenticated
  using (public.is_worker_or_admin());

drop policy if exists dispositions_write on public.purchase_dispositions;
create policy dispositions_write on public.purchase_dispositions for all to authenticated
  using (public.is_worker_or_admin()) with check (public.is_worker_or_admin());

drop policy if exists sheet_events_select on public.daily_sheet_events;
create policy sheet_events_select on public.daily_sheet_events for select to authenticated
  using (public.is_worker_or_admin());

drop policy if exists sheet_events_insert on public.daily_sheet_events;
create policy sheet_events_insert on public.daily_sheet_events for insert to authenticated
  with check (public.is_worker_or_admin());

-- ---------------------------------------------------------------------------
-- دفتر الأستاذ: قراءة فقط للمدير. لا insert/update/delete من client — RPC فقط.
-- ---------------------------------------------------------------------------
drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries for select to authenticated
  using (public.is_admin());

drop policy if exists journal_lines_select on public.journal_lines;
create policy journal_lines_select on public.journal_lines for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- الأرصدة الافتتاحية: قراءة مدير فقط، كتابة عبر RPC.
-- ---------------------------------------------------------------------------
drop policy if exists opening_select on public.opening_balances;
create policy opening_select on public.opening_balances for select to authenticated
  using (public.is_admin());

drop policy if exists opening_write on public.opening_balances;
create policy opening_write on public.opening_balances for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- السندات: مدير فقط للقراءة الكاملة؛ صاحب البقالة يقرأ سنداته المنشورة فقط.
-- ---------------------------------------------------------------------------
drop policy if exists vouchers_select on public.payment_vouchers;
create policy vouchers_select on public.payment_vouchers for select to authenticated
  using (
    public.is_admin()
    or (
      voucher_type = 'receipt_from_store'
      and status = 'posted'
      and store_id in (select public.my_store_ids())
    )
  );

drop policy if exists vouchers_admin_write on public.payment_vouchers;
create policy vouchers_admin_write on public.payment_vouchers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- audit_log: قراءة admin فقط. لا insert من client.
-- ---------------------------------------------------------------------------
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- REVOKE: لا كتابة مباشرة على الجداول المالية والتدقيق من client role.
-- RPC (SECURITY DEFINER) ينفذها بعد تحقق الصلاحية.
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.journal_entries from authenticated, anon;
revoke insert, update, delete on public.journal_lines from authenticated, anon;
revoke insert, update, delete on public.audit_log from authenticated, anon;
revoke insert, update, delete on public.accounting_accounts from authenticated, anon;

-- ---------------------------------------------------------------------------
-- دفتر مزدوج: تأكيد توازن كل قيد (deferred trigger)
-- ---------------------------------------------------------------------------
create or replace function public.assert_balanced_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debit numeric(14,2);
  v_credit numeric(14,2);
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
  into v_debit, v_credit
  from public.journal_lines
  where journal_entry_id = new.journal_entry_id;

  if v_debit <> v_credit then
    raise exception 'القيد غير متوازن: مدين % ≠ دائن %', v_debit, v_credit
      using errcode = 'check_violation';
  end if;
  if v_debit = 0 then
    raise exception 'القيد فارغ بقيمة صفر' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

-- constraint trigger مؤجل بعد كل insert على journal_lines (لكل صف، لكن يُنفذ عند commit)
drop trigger if exists journal_lines_balance on public.journal_lines;
create constraint trigger journal_lines_balance
  after insert on public.journal_lines
  deferrable initially deferred
  for each row execute function public.assert_balanced_entry();
