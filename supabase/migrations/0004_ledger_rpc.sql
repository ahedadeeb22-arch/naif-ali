-- ============================================================================
-- 0004_ledger_rpc.sql — السندات، الأرصدة الافتتاحية، إعادة الترحيل/التصحيح،
--                     كشوف الأطراف والتقارير.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- رصيد الطرف من دفتر الأستاذ (I-04)
--   البقالة: debit 1100 − credit 1100  (موجب = عليها)
--   المورد:  credit 2100 − debit 2100  (موجب = له)
-- ---------------------------------------------------------------------------
create or replace function public.store_balance(p_store_id uuid, p_as_of date default current_date)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.debit - l.credit), 0)::numeric(14,2)
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id
  where l.store_id = p_store_id
    and a.code = '1100'
    and e.effective_date <= p_as_of;
$$;

create or replace function public.supplier_balance(p_supplier_id uuid, p_as_of date default current_date)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.credit - l.debit), 0)::numeric(14,2)
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id
  where l.supplier_id = p_supplier_id
    and a.code = '2100'
    and e.effective_date <= p_as_of;
$$;

-- ---------------------------------------------------------------------------
-- رقم سند تسلسلي
-- ---------------------------------------------------------------------------
create or replace function public.next_voucher_no(p_type voucher_type, p_date date)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text := case when p_type = 'receipt_from_store' then 'RV' else 'PV' end;
  v_seq int;
begin
  select coalesce(max((substring(voucher_no from '[0-9]+$'))::int),0)+1 into v_seq
  from public.payment_vouchers
  where voucher_no like v_prefix || '-' || to_char(p_date,'YYYYMM') || '-%';
  return format('%s-%s-%04s', v_prefix, to_char(p_date,'YYYYMM'), v_seq);
end;
$$;

-- ---------------------------------------------------------------------------
-- إنشاء سند (draft) + ترحيله ذريًا في نزول واحد
--   p_idempotency_key: إعادة المحاولة تعيد النتيجة
-- ---------------------------------------------------------------------------
create or replace function public.create_and_post_voucher(
  p_type voucher_type,
  p_store_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_effective_date date,
  p_method text,
  p_reference_no text,
  p_memo text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_admin();
  v_existing public.payment_vouchers;
  v_bal numeric(14,2);
  v_entry public.journal_entries;
  v_voucher public.payment_vouchers;
  v_amt numeric(14,2);
  v_no text;
  v_cash uuid := public.account_id('1000');
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'idempotency key مطلوب' using errcode = 'invalid_parameter_value';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر' using errcode = 'check_violation';
  end if;
  v_amt := round(p_amount, 2);

  select * into v_existing from public.payment_vouchers where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('idempotent', true, 'voucher_id', v_existing.id, 'voucher_no', v_existing.voucher_no,
      'status', v_existing.status);
  end if;

  if v_cash is null then
    raise exception 'حساب النقد/البنك غير معرف' using errcode = 'no_data_found';
  end if;

  if p_type = 'receipt_from_store' then
    if p_store_id is null or p_supplier_id is not null then
      raise exception 'سند القبض يتطلب بقالة فقط' using errcode = 'check_violation';
    end if;
    perform 1 from public.stores where id = p_store_id for update;
    if not found then raise exception 'البقالة غير موجودة' using errcode = 'no_data_found'; end if;

    v_bal := public.store_balance(p_store_id, p_effective_date);
    if v_amt > v_bal + 0.001 then
      raise exception 'المبلغ (%) يتجاوز رصيد البقالة المستحق (%)', v_amt, v_bal using errcode = 'check_violation';
    end if;

    v_no := public.next_voucher_no(p_type, p_effective_date);

    insert into public.journal_entries (
      source_type, source_id, source_revision_id, entry_kind, effective_date,
      idempotency_key, posted_by, description
    ) values (
      'voucher', gen_random_uuid(), null, 'store_receipt', p_effective_date,
      p_idempotency_key, v_uid, 'سند قبض من بقالة'
    ) returning * into v_entry;

    insert into public.payment_vouchers (
      voucher_no, voucher_type, store_id, amount, effective_date, method, reference_no, memo,
      status, journal_entry_id, idempotency_key, created_by, approved_by, posted_at
    ) values (
      v_no, p_type, p_store_id, v_amt, p_effective_date, p_method, p_reference_no, p_memo,
      'posted', v_entry.id, p_idempotency_key, v_uid, v_uid, now()
    ) returning * into v_voucher;

    update public.journal_entries set source_id = v_voucher.id where id = v_entry.id;

    insert into public.journal_lines (journal_entry_id, account_id, debit, credit, store_id, description)
    values (v_entry.id, v_cash, v_amt, 0, p_store_id, 'نقد/بنك من قبض');
    insert into public.journal_lines (journal_entry_id, account_id, debit, credit, store_id, description)
    values (v_entry.id, public.account_id('1100'), 0, v_amt, p_store_id, 'تخفيض ذمة البقالة');

  else
    if p_supplier_id is null or p_store_id is not null then
      raise exception 'سند الصرف يتطلب موردًا فقط' using errcode = 'check_violation';
    end if;
    perform 1 from public.suppliers where id = p_supplier_id for update;
    if not found then raise exception 'المورد غير موجود' using errcode = 'no_data_found'; end if;

    v_bal := public.supplier_balance(p_supplier_id, p_effective_date);
    if v_amt > v_bal + 0.001 then
      raise exception 'المبلغ (%) يتجاوز رصيد المورد المستحق (%)', v_amt, v_bal using errcode = 'check_violation';
    end if;

    v_no := public.next_voucher_no(p_type, p_effective_date);

    insert into public.journal_entries (
      source_type, source_id, source_revision_id, entry_kind, effective_date,
      idempotency_key, posted_by, description
    ) values (
      'voucher', gen_random_uuid(), null, 'supplier_payment', p_effective_date,
      p_idempotency_key, v_uid, 'سند صرف لمورد'
    ) returning * into v_entry;

    insert into public.payment_vouchers (
      voucher_no, voucher_type, supplier_id, amount, effective_date, method, reference_no, memo,
      status, journal_entry_id, idempotency_key, created_by, approved_by, posted_at
    ) values (
      v_no, p_type, p_supplier_id, v_amt, p_effective_date, p_method, p_reference_no, p_memo,
      'posted', v_entry.id, p_idempotency_key, v_uid, v_uid, now()
    ) returning * into v_voucher;

    update public.journal_entries set source_id = v_voucher.id where id = v_entry.id;

    insert into public.journal_lines (journal_entry_id, account_id, debit, credit, supplier_id, description)
    values (v_entry.id, public.account_id('2100'), v_amt, 0, p_supplier_id, 'تخفيض ذمة المورد');
    insert into public.journal_lines (journal_entry_id, account_id, debit, credit, supplier_id, description)
    values (v_entry.id, v_cash, 0, v_amt, p_supplier_id, 'نقد/بنك صرف');
  end if;

  perform public.write_audit('voucher.posted','payment_voucher',v_voucher.id,null,p_memo,
    null, jsonb_build_object('voucher_no', v_voucher.voucher_no, 'amount', v_amt, 'type', p_type));

  return jsonb_build_object('idempotent', false, 'voucher_id', v_voucher.id,
    'voucher_no', v_voucher.voucher_no, 'status', 'posted', 'amount', v_amt);
end;
$$;

-- ---------------------------------------------------------------------------
-- عكس سند مرحّل: سند عكسي مرتبط + قيد عكسي (لا حذف)
-- ---------------------------------------------------------------------------
create or replace function public.reverse_voucher(p_voucher_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_admin();
  v_v public.payment_vouchers;
  v_entry public.journal_entries;
  v_rev_entry public.journal_entries;
  v_rev_voucher public.payment_vouchers;
  v_no text;
  v_cash uuid := public.account_id('1000');
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'سبب العكس مطلوب' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then raise exception 'السند غير موجود' using errcode = 'no_data_found'; end if;
  if v_v.status <> 'posted' then
    raise exception 'يمكن عكس السندات المرحلة فقط' using errcode = 'check_violation';
  end if;

  select * into v_entry from public.journal_entries where id = v_v.journal_entry_id;

  v_no := public.next_voucher_no(v_v.voucher_type, v_v.effective_date);

  insert into public.journal_entries (
    source_type, source_id, entry_kind, effective_date, idempotency_key,
    reversal_of_id, posted_by, description
  ) values (
    'voucher_reversal', gen_random_uuid(), 'reversal', v_v.effective_date,
    'reversal-voucher-' || v_v.id::text, v_entry.id, v_uid, 'عكس سند ' || v_v.voucher_no
  ) returning * into v_rev_entry;

  insert into public.journal_lines (journal_entry_id, account_id, debit, credit, store_id, supplier_id, description)
  select v_rev_entry.id, l.account_id, l.credit, l.debit, l.store_id, l.supplier_id, 'عكس: ' || coalesce(l.description,'')
  from public.journal_lines l where l.journal_entry_id = v_entry.id;

  insert into public.payment_vouchers (
    voucher_no, voucher_type, store_id, supplier_id, amount, effective_date, method, reference_no, memo,
    status, journal_entry_id, idempotency_key, created_by, approved_by, posted_at, reversal_voucher_id
  ) values (
    v_no, v_v.voucher_type, v_v.store_id, v_v.supplier_id, v_v.amount, v_v.effective_date,
    v_v.method, v_v.reference_no, 'عكس ' || v_v.voucher_no || ' — ' || p_reason,
    'reversed', v_rev_entry.id, 'reversal-voucher-set-' || v_v.id::text, v_uid, v_uid, now(), v_v.id
  ) returning * into v_rev_voucher;

  update public.journal_entries set source_id = v_rev_voucher.id where id = v_rev_entry.id;

  perform public.write_audit('voucher.reversed','payment_voucher',v_v.id,null,p_reason,
    jsonb_build_object('status','posted'),
    jsonb_build_object('reversal_voucher_id', v_rev_voucher.id, 'amount', v_v.amount));

  return jsonb_build_object('reversal_voucher_id', v_rev_voucher.id, 'reversal_voucher_no', v_rev_voucher.voucher_no);
end;
$$;

-- ---------------------------------------------------------------------------
-- الأرصدة الافتتاحية (I-02): إنشاء وترحيل قيد متوازن
-- ---------------------------------------------------------------------------
create or replace function public.post_opening_balance(
  p_party_type party_type,
  p_store_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_cutoff_date date,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_admin();
  v_existing public.opening_balances;
  v_entry public.journal_entries;
  v_ob public.opening_balances;
  v_amt numeric(14,2) := round(p_amount,2);
  v_equity uuid := public.account_id('3100');
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'idempotency key مطلوب' using errcode = 'invalid_parameter_value';
  end if;
  if v_amt is null or v_amt <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر' using errcode = 'check_violation';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'السبب مطلوب' using errcode = 'invalid_parameter_value';
  end if;
  if v_equity is null then
    raise exception 'حساب الحقوق الافتتاحية غير معرف' using errcode = 'no_data_found';
  end if;

  select * into v_existing from public.opening_balances where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('idempotent', true, 'opening_id', v_existing.id);
  end if;

  if p_party_type = 'store' and p_store_id is null then
    raise exception 'البقالة مطلوبة' using errcode = 'invalid_parameter_value';
  end if;
  if p_party_type = 'supplier' and p_supplier_id is null then
    raise exception 'المورد مطلوب' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.journal_entries (
    source_type, source_id, entry_kind, effective_date, idempotency_key, posted_by, description
  ) values (
    'opening_balance', gen_random_uuid(), 'opening', p_cutoff_date, p_idempotency_key, v_uid, 'رصيد افتتاحي'
  ) returning * into v_entry;

  insert into public.opening_balances (
    party_type, store_id, supplier_id, cutoff_date, amount, direction, reason,
    status, journal_entry_id, idempotency_key, created_by, approved_by, posted_at
  ) values (
    p_party_type, p_store_id, p_supplier_id, p_cutoff_date, v_amt, 'debit', p_reason,
    'posted', v_entry.id, p_idempotency_key, v_uid, v_uid, now()
  ) returning * into v_ob;

  update public.journal_entries set source_id = v_ob.id where id = v_entry.id;

  if p_party_type = 'store' then
    insert into public.journal_lines (journal_entry_id, account_id, debit, credit, store_id, description)
    values (v_entry.id, public.account_id('1100'), v_amt, 0, p_store_id, 'رصيد افتتاحي على البقالة');
    insert into public.journal_lines (journal_entry_id, account_id, debit, credit, store_id, description)
    values (v_entry.id, v_equity, 0, v_amt, p_store_id, 'حقوق افتتاحية');
  else
    insert into public.journal_lines (journal_entry_id, account_id, debit, credit, supplier_id, description)
    values (v_entry.id, v_equity, v_amt, 0, p_supplier_id, 'حقوق افتتاحية');
    insert into public.journal_lines (journal_entry_id, account_id, debit, credit, supplier_id, description)
    values (v_entry.id, public.account_id('2100'), 0, v_amt, p_supplier_id, 'رصيد افتتاحي للمورد');
  end if;

  perform public.write_audit('opening.posted','opening_balance',v_ob.id,null,p_reason,
    null, jsonb_build_object('party_type', p_party_type, 'amount', v_amt));

  return jsonb_build_object('idempotent', false, 'opening_id', v_ob.id, 'journal_entry_id', v_entry.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- إعادة فتح يوم مرحّل/مغلق (admin + سبب)
--   تُنشئ revision جديدة مسودة، وتبقي السابقة immutable.
-- ---------------------------------------------------------------------------
create or replace function public.reopen_for_correction(
  p_sheet_id uuid,
  p_expected_version int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_admin();
  v_sheet public.daily_sheets;
  v_prev public.daily_sheet_revisions;
  v_new public.daily_sheet_revisions;
  v_rev_no int;
begin
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'سبب التعديل مطلوب (5 أحرف على الأقل)' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_sheet from public.daily_sheets where id = p_sheet_id for update;
  if not found then raise exception 'اليومية غير موجودة' using errcode = 'no_data_found'; end if;
  if v_sheet.version <> p_expected_version then
    raise exception 'CONFLICT_VERSION' using errcode = 'serialization_failure';
  end if;
  if v_sheet.status not in ('posted','closed') then
    raise exception 'اليومية ليست مرحّلة/مغلقة' using errcode = 'check_violation';
  end if;

  select * into v_prev from public.daily_sheet_revisions where id = v_sheet.current_revision_id for update;

  select coalesce(max(revision_no),0)+1 into v_rev_no
  from public.daily_sheet_revisions where daily_sheet_id = v_sheet.id;

  insert into public.daily_sheet_revisions (
    daily_sheet_id, revision_no, based_on_revision_id, status, revision_kind,
    reason, business_date_snapshot, created_by
  ) values (
    v_sheet.id, v_rev_no, v_prev.id, 'draft', 'correction',
    p_reason, v_sheet.business_date, v_uid
  ) returning * into v_new;

  -- نسخ سطور الشراء وتوزيعاتها (نسخة قابلة للتحرير)
  insert into public.purchase_lines (
    revision_id, product_id, supplier_id, purchase_status,
    purchased_quantity, basket_unit_price, currency_code, note, cancellation_reason, free_reason,
    line_no, created_by
  )
  select
    v_new.id, pl.product_id, pl.supplier_id, pl.purchase_status,
    pl.purchased_quantity, pl.basket_unit_price, pl.currency_code, pl.note, pl.cancellation_reason, pl.free_reason,
    pl.line_no, v_uid
  from public.purchase_lines pl where pl.revision_id = v_prev.id;

  insert into public.purchase_dispositions (
    purchase_line_id, disposition_type, store_id, quantity, unit_cost, reason, approved_by
  )
  select nl.id, d.disposition_type, d.store_id, d.quantity, d.unit_cost, d.reason, d.approved_by
  from public.purchase_dispositions d
  join public.purchase_lines ol on ol.id = d.purchase_line_id and ol.revision_id = v_prev.id
  join public.purchase_lines nl on nl.revision_id = v_new.id and nl.line_no = ol.line_no;

  update public.daily_sheets set
    status = 'draft', current_revision_id = v_new.id, version = version + 1
  where id = v_sheet.id;

  insert into public.daily_sheet_events (daily_sheet_id, revision_id, from_status, to_status, actor_id, reason)
  values (v_sheet.id, v_new.id, v_sheet.status::text, 'draft', v_uid, p_reason);

  perform public.write_audit('sheet.reopened','daily_sheet',v_sheet.id,v_new.id,p_reason,
    jsonb_build_object('previous_revision_id', v_prev.id, 'status', v_sheet.status),
    jsonb_build_object('new_revision_id', v_new.id, 'revision_no', v_rev_no));

  return jsonb_build_object('revision_id', v_new.id, 'revision_no', v_rev_no, 'version', v_sheet.version + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- post_correction: ترحيل إصدار تصحيح: عكس قيود الإصدار السابق + قيد جديد.
-- ---------------------------------------------------------------------------
create or replace function public.post_correction(
  p_revision_id uuid,
  p_expected_version int,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_admin();
  v_rev public.daily_sheet_revisions;
  v_sheet public.daily_sheets;
  v_prev public.daily_sheet_revisions;
  v_check jsonb;
  v_entry public.journal_entries;
  v_rev_entry public.journal_entries;
  v_old_entry public.journal_entries;
  v_line record;
  v_disp record;
  v_dist_total numeric(14,2) := 0;
  v_inv_total numeric(14,2) := 0;
  v_dmg_total numeric(14,2) := 0;
  v_pur_total numeric(14,2) := 0;
  v_amt numeric(14,2);
  v_total_before numeric(14,2) := 0;
  v_total_after numeric(14,2) := 0;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'idempotency key مطلوب' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_entry from public.journal_entries where idempotency_key = p_idempotency_key;
  if found then
    if v_entry.source_id is distinct from p_revision_id then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'unique_violation';
    end if;
    return jsonb_build_object('idempotent', true, 'journal_entry_id', v_entry.id, 'status','posted');
  end if;

  select * into v_rev from public.daily_sheet_revisions where id = p_revision_id for update;
  if not found then raise exception 'الإصدار غير موجود' using errcode = 'no_data_found'; end if;
  select * into v_sheet from public.daily_sheets where id = v_rev.daily_sheet_id for update;

  if v_rev.revision_kind <> 'correction' then
    raise exception 'استخدم post_revision للإصدار الأصلي' using errcode = 'check_violation';
  end if;
  if v_rev.status <> 'ready_for_review' or v_sheet.status <> 'ready_for_review' then
    raise exception 'حالة اليومية لا تسمح بالاعتماد' using errcode = 'check_violation';
  end if;
  if v_sheet.version <> p_expected_version then
    raise exception 'CONFLICT_VERSION' using errcode = 'serialization_failure';
  end if;

  v_check := public.check_revision_readiness(p_revision_id);
  if not (v_check->>'ready')::boolean then
    raise exception 'READINESS_FAILED: %', v_check::text using errcode = 'check_violation';
  end if;

  select * into v_prev from public.daily_sheet_revisions where id = v_rev.based_on_revision_id;

  -- 1) عكس قيد الإصدار السابق
  select * into v_old_entry from public.journal_entries
    where source_type = 'daily_revision' and source_revision_id = v_prev.id and entry_kind = 'purchase';

  if found then
    v_total_before := 0;
    insert into public.journal_entries (
      source_type, source_id, source_revision_id, entry_kind, effective_date,
      idempotency_key, reversal_of_id, posted_by, description
    ) values (
      'daily_revision_reversal', p_revision_id, v_prev.id, 'reversal', v_sheet.business_date,
      'reversal-' || p_idempotency_key, v_old_entry.id, v_uid,
      'عكس يومية ' || v_sheet.business_date::text
    ) returning * into v_rev_entry;

    insert into public.journal_lines (
      journal_entry_id, account_id, debit, credit, store_id, supplier_id, product_id, purchase_line_id, revision_id, description
    )
    select v_rev_entry.id, l.account_id, l.credit, l.debit, l.store_id, l.supplier_id,
            l.product_id, l.purchase_line_id, v_prev.id, 'عكس: ' || coalesce(l.description,'')
    from public.journal_lines l where l.journal_entry_id = v_old_entry.id;

    update public.daily_sheet_revisions set status = 'superseded', superseded_by_revision_id = p_revision_id
      where id = v_prev.id;
  end if;

  -- 2) تثبيت الإصدار الجديد (نفس منطق post_revision)
  insert into public.journal_entries (
    source_type, source_id, source_revision_id, entry_kind, effective_date,
    idempotency_key, posted_by, description
  ) values (
    'daily_revision', p_revision_id, p_revision_id, 'purchase', v_sheet.business_date,
    p_idempotency_key, v_uid, 'تصحيح يومية ' || v_sheet.business_date::text
  ) returning * into v_entry;

  for v_line in
    select pl.* from public.purchase_lines pl
    where pl.revision_id = p_revision_id and pl.purchase_status = 'purchased'
    order by pl.line_no
  loop
    v_amt := round(v_line.purchased_quantity * v_line.basket_unit_price, 2);
    v_pur_total := v_pur_total + v_amt;
    if v_amt > 0 then
      insert into public.journal_lines (journal_entry_id, account_id, debit, credit, supplier_id, product_id, purchase_line_id, revision_id, description)
      values (v_entry.id, public.account_id('1200'), v_amt, 0, v_line.supplier_id, v_line.product_id, v_line.id, p_revision_id, 'شراء');
      insert into public.journal_lines (journal_entry_id, account_id, debit, credit, supplier_id, product_id, purchase_line_id, revision_id, description)
      values (v_entry.id, public.account_id('2100'), 0, v_amt, v_line.supplier_id, v_line.product_id, v_line.id, p_revision_id, 'ذمة مورد آجلة');
    end if;
  end loop;

  for v_disp in
    select d.*, pl.supplier_id, pl.product_id
    from public.purchase_dispositions d
    join public.purchase_lines pl on pl.id = d.purchase_line_id
    where pl.revision_id = p_revision_id
  loop
    if v_disp.disposition_type = 'store_distribution' then
      v_amt := round(v_disp.quantity * v_disp.unit_cost, 2);
      v_dist_total := v_dist_total + v_amt;
      insert into public.journal_lines (journal_entry_id, account_id, debit, credit, store_id, supplier_id, product_id, purchase_line_id, revision_id, description)
      values (v_entry.id, public.account_id('1100'), v_amt, 0, v_disp.store_id, v_disp.supplier_id, v_disp.product_id, v_disp.purchase_line_id, p_revision_id, 'تحميل بقالة');
      insert into public.journal_lines (journal_entry_id, account_id, debit, credit, store_id, supplier_id, product_id, purchase_line_id, revision_id, description)
      values (v_entry.id, public.account_id('1200'), 0, v_amt, v_disp.store_id, v_disp.supplier_id, v_disp.product_id, v_disp.purchase_line_id, p_revision_id, 'صرف من المخزون للبقالة');
    elsif v_disp.disposition_type = 'damaged' then
      v_amt := round(v_disp.quantity * v_disp.unit_cost, 2);
      v_dmg_total := v_dmg_total + v_amt;
      insert into public.journal_lines (journal_entry_id, account_id, debit, credit, supplier_id, product_id, purchase_line_id, revision_id, description)
      values (v_entry.id, public.account_id('5100'), v_amt, 0, v_disp.supplier_id, v_disp.product_id, v_disp.purchase_line_id, p_revision_id, 'خسارة تلف');
      insert into public.journal_lines (journal_entry_id, account_id, debit, credit, supplier_id, product_id, purchase_line_id, revision_id, description)
      values (v_entry.id, public.account_id('1200'), 0, v_amt, v_disp.supplier_id, v_disp.product_id, v_disp.purchase_line_id, p_revision_id, 'خروج مخزون تالف');
    elsif v_disp.disposition_type = 'inventory_remaining' then
      v_inv_total := v_inv_total + round(v_disp.quantity * v_disp.unit_cost, 2);
    end if;
  end loop;

  if round(v_dist_total + v_inv_total + v_dmg_total, 2) <> round(v_pur_total, 2) then
    raise exception 'RECONCILIATION_FAILED' using errcode = 'check_violation';
  end if;

  v_total_after := v_pur_total;

  update public.daily_sheet_revisions set
    status = 'posted', posted_by = v_uid, posted_at = now(),
    total_purchase_value = round(v_pur_total,2),
    total_distributed_value = round(v_dist_total,2),
    total_inventory_value = round(v_inv_total,2),
    total_damaged_value = round(v_dmg_total,2),
    reverses_revision_id = v_prev.id
  where id = p_revision_id;

  update public.daily_sheets set
    status = 'posted', posted_by = v_uid, posted_at = now(), version = version + 1
  where id = v_sheet.id;

  insert into public.daily_sheet_events (daily_sheet_id, revision_id, from_status, to_status, actor_id, reason)
  values (v_sheet.id, p_revision_id, v_sheet.status::text, 'posted', v_uid, v_rev.reason);

  perform public.write_audit('sheet.correction_posted','daily_sheet',v_sheet.id,p_revision_id,v_rev.reason,
    jsonb_build_object('previous_revision_id', v_prev.id, 'previous_total', v_prev.total_purchase_value),
    jsonb_build_object('new_total', v_total_after, 'journal_entry_id', v_entry.id,
      'delta', v_total_after - coalesce(v_prev.total_purchase_value,0)));

  return jsonb_build_object(
    'status','posted','idempotent',false,'journal_entry_id', v_entry.id,
    'previous_revision_id', v_prev.id,
    'purchase_total', v_pur_total,
    'delta', v_total_after - coalesce(v_prev.total_purchase_value,0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- close_sheet: posted → closed (admin)
-- ---------------------------------------------------------------------------
create or replace function public.close_sheet(p_sheet_id uuid, p_expected_version int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_admin();
  v_sheet public.daily_sheets;
begin
  select * into v_sheet from public.daily_sheets where id = p_sheet_id for update;
  if not found then raise exception 'اليومية غير موجودة' using errcode = 'no_data_found'; end if;
  if v_sheet.version <> p_expected_version then
    raise exception 'CONFLICT_VERSION' using errcode = 'serialization_failure';
  end if;
  if v_sheet.status <> 'posted' then
    raise exception 'يمكن إغلاق يومية مرحّلة فقط' using errcode = 'check_violation';
  end if;

  update public.daily_sheets set status = 'closed', closed_by = v_uid, closed_at = now(), version = version + 1
  where id = p_sheet_id;

  insert into public.daily_sheet_events (daily_sheet_id, revision_id, from_status, to_status, actor_id)
  values (v_sheet.id, v_sheet.current_revision_id, 'posted', 'closed', v_uid);

  perform public.write_audit('sheet.closed','daily_sheet',v_sheet.id,v_sheet.current_revision_id,null,
    jsonb_build_object('status','posted'), jsonb_build_object('status','closed'));

  return jsonb_build_object('status','closed','version', v_sheet.version + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- كشف البقالة (فترة) — صاحب البقالة يرى فقط ما يخصه (RLS على bindings أعلاه
-- لا تكفي للقراءة من journal_lines لأن RLS يحجبها؛ لذلك نستخدم دالة SECURITY
-- DEFINER تتحقق من membership صراحة).
-- ---------------------------------------------------------------------------
create or replace function public.store_statement(
  p_store_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed boolean;
  v_opening numeric(14,2);
  v_total_charges numeric(14,2);
  v_total_paid numeric(14,2);
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'الجلسة غير صالحة' using errcode = 'insufficient_privilege'; end if;

  if not public.is_admin() then
    select public.owns_store(p_store_id) into v_allowed;
    if not coalesce(v_allowed,false) then
      raise exception 'لا تملك صلاحية القراءة لهذه البقالة' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'فترة غير صالحة' using errcode = 'invalid_parameter_value';
  end if;

  v_opening := public.store_balance(p_store_id, p_from - 1);

  select coalesce(sum(l.debit - l.credit),0) into v_total_charges
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '1100'
  where l.store_id = p_store_id and e.effective_date between p_from and p_to;

  select coalesce(sum(greatest(l.debit - l.credit, 0)),0),
         coalesce(sum(case when l.credit > l.debit then l.credit else 0 end),0)
  into v_total_charges, v_total_paid
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '1100'
  where l.store_id = p_store_id and e.effective_date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entry_no', e.entry_no,
    'date', e.effective_date,
    'kind', e.entry_kind,
    'description', l.description,
    'product_name', p.name,
    'supplier_name', s.name,
    'quantity', d.quantity,
    'unit_cost', d.unit_cost,
    'debit', l.debit,
    'credit', l.credit,
    'balance', v_opening + sum(l.debit - l.credit) over (
      order by e.effective_date, e.entry_no, l.id
      rows between unbounded preceding and current row
    )
  ) order by e.effective_date, e.entry_no), '[]'::jsonb)
  into v_rows
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '1100'
  left join public.products p on p.id = l.product_id
  left join public.suppliers s on s.id = l.supplier_id
  left join public.purchase_dispositions d on d.purchase_line_id = l.purchase_line_id
    and d.store_id = l.store_id and d.disposition_type = 'store_distribution' and l.debit > 0
  where l.store_id = p_store_id
    and e.effective_date between p_from and p_to;

  return jsonb_build_object(
    'store_id', p_store_id,
    'from', p_from,
    'to', p_to,
    'opening_balance', v_opening,
    'total_charges', v_total_charges,
    'total_paid', v_total_paid,
    'closing_balance', v_opening + v_total_charges - v_total_paid,
    'rows', v_rows
  );
end;
$$;

create or replace function public.supplier_statement(
  p_supplier_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_temp, public
as $$
declare
  v_opening numeric(14,2);
  v_total_purchases numeric(14,2);
  v_total_paid numeric(14,2);
  v_rows jsonb;
begin
  perform public.assert_admin();

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'فترة غير صالحة' using errcode = 'invalid_parameter_value';
  end if;

  v_opening := public.supplier_balance(p_supplier_id, p_from - 1);

  select coalesce(sum(l.credit),0), coalesce(sum(l.debit),0)
  into v_total_purchases, v_total_paid
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '2100'
  where l.supplier_id = p_supplier_id and e.effective_date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entry_no', e.entry_no,
    'date', e.effective_date,
    'kind', e.entry_kind,
    'description', l.description,
    'product_name', p.name,
    'quantity', pl.purchased_quantity,
    'unit_price', pl.basket_unit_price,
    'debit', l.debit,
    'credit', l.credit,
    'balance', v_opening + sum(l.credit - l.debit) over (
      order by e.effective_date, e.entry_no, l.id
      rows between unbounded preceding and current row
    )
  ) order by e.effective_date, e.entry_no), '[]'::jsonb)
  into v_rows
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '2100'
  left join public.products p on p.id = l.product_id
  left join public.purchase_lines pl on pl.id = l.purchase_line_id
  where l.supplier_id = p_supplier_id
    and e.effective_date between p_from and p_to;

  return jsonb_build_object(
    'supplier_id', p_supplier_id,
    'from', p_from,
    'to', p_to,
    'opening_balance', v_opening,
    'total_purchases', v_total_purchases,
    'total_paid', v_total_paid,
    'closing_balance', v_opening + v_total_purchases - v_total_paid,
    'rows', v_rows
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- ملخص لوحة المدير
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_summary(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase_today numeric(14,2);
  v_sheet jsonb;
  v_supplier_due numeric(14,2);
  v_store_due numeric(14,2);
  v_inventory numeric(14,2);
  v_damaged numeric(14,2);
begin
  perform public.assert_admin();

  select coalesce(sum(total_purchase_value),0) into v_purchase_today
  from public.daily_sheet_revisions
  where business_date_snapshot = p_date and status = 'posted';

  select jsonb_build_object(
    'id', d.id, 'status', d.status, 'version', d.version,
    'business_date', d.business_date, 'revision_no', r.revision_no
  ) into v_sheet
  from public.daily_sheets d
  left join public.daily_sheet_revisions r on r.id = d.current_revision_id
  where d.business_date = p_date;

  select coalesce(sum(l.credit - l.debit),0) into v_supplier_due
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '2100'
  where e.effective_date <= p_date;

  select coalesce(sum(l.debit - l.credit),0) into v_store_due
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '1100'
  where e.effective_date <= p_date;

  -- رصيد المخزون = 1200 debit − credit
  select coalesce(sum(l.debit - l.credit),0) into v_inventory
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '1200'
  where e.effective_date <= p_date;

  select coalesce(sum(l.debit - l.credit),0) into v_damaged
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
  join public.accounting_accounts a on a.id = l.account_id and a.code = '5100'
  where e.effective_date <= p_date;

  return jsonb_build_object(
    'date', p_date,
    'purchase_today', v_purchase_today,
    'supplier_due', v_supplier_due,
    'store_due', v_store_due,
    'inventory_balance', v_inventory,
    'damage_expense', v_damaged,
    'sheet', v_sheet
  );
end;
$$;

-- Grants: فقط ما يلزم من RPC؛ لا grants مباشرة للجداول المالية.
revoke all on function public.store_balance(uuid, date) from public, anon;
revoke all on function public.supplier_balance(uuid, date) from public, anon;
grant execute on function public.store_statement(uuid, date, date) to authenticated;
grant execute on function public.supplier_statement(uuid, date, date) to authenticated;
grant execute on function public.dashboard_summary(date) to authenticated;
create or replace function public.reconciliation_report(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_purchase numeric(14,2);
  v_dist numeric(14,2);
  v_inv numeric(14,2);
  v_dmg numeric(14,2);
  v_check jsonb;
begin
  perform public.assert_session();

  select
    coalesce(sum(d.quantity*d.unit_cost) filter (where d.disposition_type='store_distribution'),0),
    coalesce(sum(d.quantity*d.unit_cost) filter (where d.disposition_type='inventory_remaining'),0),
    coalesce(sum(d.quantity*d.unit_cost) filter (where d.disposition_type='damaged'),0)
  into v_dist, v_inv, v_dmg
  from public.purchase_dispositions d
  join public.purchase_lines l on l.id = d.purchase_line_id
  where l.revision_id = p_revision_id;

  select coalesce(sum(round(purchased_quantity * coalesce(basket_unit_price,0), 2)),0) into v_purchase
  from public.purchase_lines
  where revision_id = p_revision_id and purchase_status = 'purchased';

  v_check := public.check_revision_readiness(p_revision_id);

  return jsonb_build_object(
    'purchase_total', v_purchase,
    'distributed_total', v_dist,
    'inventory_total', v_inv,
    'damaged_total', v_dmg,
    'difference', v_purchase - (v_dist + v_inv + v_dmg),
    'ready', (v_check->>'ready')::boolean,
    'errors', v_check->'errors'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants لدوال 0003_rpc و0004 (الوصول فقط للمستخدمين المسجلين؛ التحقق داخلي)
-- ---------------------------------------------------------------------------
revoke all on function public.get_or_create_draft(date) from public, anon;
revoke all on function public.save_purchase_line(uuid, int, jsonb) from public, anon;
revoke all on function public.replace_line_dispositions(uuid, int, jsonb) from public, anon;
revoke all on function public.cancel_purchase_line(uuid, int, text) from public, anon;
revoke all on function public.upsert_night_order(date, uuid, jsonb, boolean) from public, anon;
revoke all on function public.submit_revision(uuid, int) from public, anon;
revoke all on function public.post_revision(uuid, int, text) from public, anon;
revoke all on function public.create_and_post_voucher(voucher_type, uuid, uuid, numeric, date, text, text, text, text) from public, anon;
revoke all on function public.reverse_voucher(uuid, text) from public, anon;
revoke all on function public.post_opening_balance(party_type, uuid, uuid, numeric, date, text, text) from public, anon;
revoke all on function public.reopen_for_correction(uuid, int, text) from public, anon;
revoke all on function public.post_correction(uuid, int, text) from public, anon;
revoke all on function public.close_sheet(uuid, int) from public, anon;

grant execute on function public.get_or_create_draft(date) to authenticated;
grant execute on function public.save_purchase_line(uuid, int, jsonb) to authenticated;
grant execute on function public.replace_line_dispositions(uuid, int, jsonb) to authenticated;
grant execute on function public.cancel_purchase_line(uuid, int, text) to authenticated;
grant execute on function public.upsert_night_order(date, uuid, jsonb, boolean) to authenticated;
grant execute on function public.submit_revision(uuid, int) to authenticated;
grant execute on function public.post_revision(uuid, int, text) to authenticated;
grant execute on function public.create_and_post_voucher(voucher_type, uuid, uuid, numeric, date, text, text, text, text) to authenticated;
grant execute on function public.reverse_voucher(uuid, text) to authenticated;
grant execute on function public.post_opening_balance(party_type, uuid, uuid, numeric, date, text, text) to authenticated;
grant execute on function public.reopen_for_correction(uuid, int, text) to authenticated;
grant execute on function public.post_correction(uuid, int, text) to authenticated;
grant execute on function public.close_sheet(uuid, int) to authenticated;

-- دوال التحقق الداخلية لا تُمنح للعميل
revoke all on function public.assert_session(text) from public, anon, authenticated;
revoke all on function public.assert_admin() from public, anon, authenticated;
revoke all on function public.write_audit(text, text, uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
