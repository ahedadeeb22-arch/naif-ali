-- ============================================================================
-- 0003_rpc.sql — الإجراءات المالية الذرية
-- كل عمليات التأثير المالي تمر من هنا. لا يثق بـactor أو role من العميل.
-- قواعد:
--  * SECURITY DEFINER + search_path ثابت + تحقق صلاحية داخل الدالة.
--  * transaction واحدة لكل عملية، row lock + idempotency.
--  * immutable بعد النشر (لا UPDATE/DELETE لقيود اليومية المنشورة).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- أدوات داخلية
-- ---------------------------------------------------------------------------
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
  select role, active into v_role, v_active from public.profiles where user_id = v_uid;
  if not found or not v_active then
    raise exception 'الحساب غير مفعّل' using errcode = 'insufficient_privilege';
  end if;
  if p_permission is null and v_role not in ('admin', 'worker') then
    raise exception 'هذه العملية مخصصة للإدارة والتشغيل' using errcode = 'insufficient_privilege';
  end if;
  if p_permission is not null and not public.has_permission(p_permission) then
    raise exception 'لا تملك صلاحية تنفيذ هذه العملية' using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end;
$$;

create or replace function public.assert_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid;
begin
  v_uid := public.assert_session();
  if not public.is_admin() then
    raise exception 'هذه العملية تتطلب صلاحية مدير' using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end;
$$;

create or replace function public.round_money(p_value numeric)
returns numeric
language sql immutable
as $$ select round(coalesce(p_value,0), 2) $$;

create or replace function public.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_revision_id uuid,
  p_reason text,
  p_before jsonb,
  p_after jsonb,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_log (actor_id, action, entity_type, entity_id, revision_id, reason, before_data, after_data, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_revision_id, p_reason, p_before, p_after, p_metadata);
end;
$$;

create or replace function public.account_id(p_code text)
returns uuid
language sql stable
as $$ select id from public.accounting_accounts where code = p_code $$;

-- ---------------------------------------------------------------------------
-- تحديث/إنشاء مسودة يومية + الإصدار الأول
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_draft(p_business_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_session('sheet.create');
  v_sheet public.daily_sheets;
  v_rev public.daily_sheet_revisions;
  v_attempt int := 0;
begin
  if p_business_date is null then
    raise exception 'تاريخ يوم العمل مطلوب' using errcode = 'invalid_parameter_value';
  end if;

  -- قفل منطقي: إنشاء اليوم إن لم يوجد (مع إعادة محاولة عند التزامن)
  loop
    select * into v_sheet from public.daily_sheets where business_date = p_business_date for update;
    if found then
      exit;
    end if;
    begin
      insert into public.daily_sheets (business_date, status, created_by)
      values (p_business_date, 'draft', v_uid)
      returning * into v_sheet;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 3 then raise; end if;
    end;
  end loop;

  if v_sheet.status not in ('draft') then
    raise exception 'لا يمكن فتح مسودة ليوم حالتها %', v_sheet.status using errcode = 'check_violation';
  end if;

  if v_sheet.current_revision_id is null then
    insert into public.daily_sheet_revisions (
      daily_sheet_id, revision_no, status, business_date_snapshot, created_by
    ) values (
      v_sheet.id, 1, 'draft', v_sheet.business_date, v_uid
    ) returning * into v_rev;

    update public.daily_sheets
      set current_revision_id = v_rev.id
      where id = v_sheet.id
      returning * into v_sheet;
  else
    select * into v_rev from public.daily_sheet_revisions where id = v_sheet.current_revision_id;
  end if;

  if v_rev.status <> 'draft' then
    raise exception 'الإصدار الحالي ليس مسودة' using errcode = 'check_violation';
  end if;

  return jsonb_build_object(
    'sheet_id', v_sheet.id,
    'revision_id', v_rev.id,
    'revision_no', v_rev.revision_no,
    'version', v_sheet.version,
    'status', v_sheet.status,
    'business_date', v_sheet.business_date
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- إضافة/تعديل سطر شراء داخل مسودة
--   p_line JSONB: { id?, product_id, supplier_id, purchase_status,
--                  purchased_quantity, basket_unit_price, note, cancellation_reason, free_reason }
-- ---------------------------------------------------------------------------
create or replace function public.save_purchase_line(
  p_revision_id uuid,
  p_expected_version int,
  p_line jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_session('sheet.edit');
  v_rev public.daily_sheet_revisions;
  v_sheet public.daily_sheets;
  v_status purchase_status;
  v_product uuid;
  v_supplier uuid;
  v_qty numeric(12,3);
  v_price numeric(14,2);
  v_line_id uuid;
  v_line_no int;
begin
  select * into v_rev from public.daily_sheet_revisions where id = p_revision_id for update;
  if not found then raise exception 'الإصدار غير موجود' using errcode = 'no_data_found'; end if;

  select * into v_sheet from public.daily_sheets where id = v_rev.daily_sheet_id for update;

  if v_sheet.status <> 'draft' or v_rev.status <> 'draft' then
    raise exception 'لا يمكن التعديل بعد تقديم اليومية للمراجعة' using errcode = 'check_violation';
  end if;
  if v_sheet.version <> p_expected_version or v_rev.version <> p_expected_version then
    raise exception 'CONFLICT_VERSION' using errcode = 'serialization_failure';
  end if;

  v_product := (p_line->>'product_id')::uuid;
  v_supplier := nullif(p_line->>'supplier_id','')::uuid;
  v_status := coalesce((p_line->>'purchase_status')::purchase_status, 'purchased');
  v_qty := coalesce((p_line->>'purchased_quantity')::numeric, 0);
  v_price := nullif(p_line->>'basket_unit_price','')::numeric;

  if v_qty < 0 then raise exception 'الكمية سالبة' using errcode = 'check_violation'; end if;
  if v_qty > 999 then raise exception 'الكمية أكبر من الحد' using errcode = 'check_violation'; end if;
  if v_price is not null and (v_price < 0 or v_price > 99999) then
    raise exception 'السعر خارج النطاق' using errcode = 'check_violation';
  end if;

  v_line_id := nullif(p_line->>'id','')::uuid;

  if v_line_id is null then
    select coalesce(max(line_no),0)+1 into v_line_no
    from public.purchase_lines where revision_id = p_revision_id;

    insert into public.purchase_lines (
      revision_id, product_id, supplier_id, purchase_status,
      purchased_quantity, basket_unit_price, note, cancellation_reason, free_reason,
      line_no, created_by
    ) values (
      p_revision_id, v_product, v_supplier, v_status,
      v_qty, v_price, p_line->>'note', p_line->>'cancellation_reason', p_line->>'free_reason',
      v_line_no, v_uid
    ) returning id into v_line_id;
  else
    update public.purchase_lines set
      product_id = v_product,
      supplier_id = v_supplier,
      purchase_status = v_status,
      purchased_quantity = v_qty,
      basket_unit_price = v_price,
      note = p_line->>'note',
      cancellation_reason = p_line->>'cancellation_reason',
      free_reason = p_line->>'free_reason',
      updated_at = now()
    where id = v_line_id and revision_id = p_revision_id;
    if not found then raise exception 'السطر غير موجود في هذا الإصدار' using errcode = 'no_data_found'; end if;

    -- تصفير التوزيعات إذا تغيّرت الكمية أو المصدر أو الحالة
    if v_status <> 'purchased' then
      delete from public.purchase_dispositions where purchase_line_id = v_line_id;
    end if;
  end if;

  update public.daily_sheets set version = version + 1 where id = v_sheet.id;
  update public.daily_sheet_revisions set version = version + 1 where id = v_rev.id;

  return jsonb_build_object('line_id', v_line_id, 'version', v_sheet.version + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- استبدال توزيعات سطر (مسودة فقط)
--   p_dispositions JSONB: [ { disposition_type, store_id?, quantity, unit_cost?, reason? } ]
--   الوحدة: unit_cost يجب أن يساوي سعر السطر (لأن وحدة السلة = وحدة التوزيع)
-- ---------------------------------------------------------------------------
create or replace function public.replace_line_dispositions(
  p_line_id uuid,
  p_expected_version int,
  p_dispositions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_session('sheet.edit');
  v_line public.purchase_lines;
  v_rev public.daily_sheet_revisions;
  v_sheet public.daily_sheets;
  v_sum numeric(12,3) := 0;
  v_item jsonb;
  v_type disposition_type;
  v_store uuid;
  v_qty numeric(12,3);
  v_cost numeric(14,2);
begin
  select * into v_line from public.purchase_lines where id = p_line_id for update;
  if not found then raise exception 'السطر غير موجود' using errcode = 'no_data_found'; end if;

  select * into v_rev from public.daily_sheet_revisions where id = v_line.revision_id for update;
  select * into v_sheet from public.daily_sheets where id = v_rev.daily_sheet_id for update;

  if v_sheet.status <> 'draft' or v_rev.status <> 'draft' then
    raise exception 'لا يمكن تعديل التوزيع بعد الاعتماد' using errcode = 'check_violation';
  end if;
  if v_sheet.version <> p_expected_version then
    raise exception 'CONFLICT_VERSION' using errcode = 'serialization_failure';
  end if;
  if v_line.purchase_status <> 'purchased' then
    raise exception 'لا يمكن توزيع سطر ملغى أو مجاني' using errcode = 'check_violation';
  end if;
  if v_line.basket_unit_price is null then
    raise exception 'سعر السطر غير مدخل' using errcode = 'check_violation';
  end if;

  delete from public.purchase_dispositions where purchase_line_id = p_line_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_dispositions, '[]'::jsonb)) loop
    v_type := (v_item->>'disposition_type')::disposition_type;
    v_store := nullif(v_item->>'store_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := v_line.basket_unit_price;

    if v_qty is null or v_qty <= 0 then
      raise exception 'كمية التوزيع يجب أن تكون أكبر من صفر' using errcode = 'check_violation';
    end if;
    if (v_item->>'unit_cost') is not null and (v_item->>'unit_cost')::numeric <> v_line.basket_unit_price then
      raise exception 'تكلفة الوحدة يجب أن تساوي سعر سطر الشراء' using errcode = 'check_violation';
    end if;
    if v_type = 'supplier_free_quantity' then
      raise exception 'الكمية المجانية من المورد تسجل كسطر مستقل بسعر صفر' using errcode = 'check_violation';
    end if;

    insert into public.purchase_dispositions (
      purchase_line_id, disposition_type, store_id, quantity, unit_cost, reason, approved_by
    ) values (
      p_line_id, v_type, v_store, v_qty, v_cost, v_item->>'reason', case when v_type in ('damaged','other_approved') then v_uid else null end
    );
    v_sum := v_sum + v_qty;
  end loop;

  if v_sum > v_line.purchased_quantity then
    raise exception 'مجموع التوزيع (%) يتجاوز الكمية المشتراة (%)', v_sum, v_line.purchased_quantity
      using errcode = 'check_violation';
  end if;

  update public.daily_sheets set version = version + 1 where id = v_sheet.id;
  update public.daily_sheet_revisions set version = version + 1 where id = v_rev.id;

  return jsonb_build_object(
    'allocated_quantity', v_sum,
    'remaining_quantity', v_line.purchased_quantity - v_sum,
    'version', v_sheet.version + 1
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- حذف (إلغاء) سطر: مسودة فقط، يُسجل في audit
-- ---------------------------------------------------------------------------
create or replace function public.cancel_purchase_line(
  p_line_id uuid,
  p_expected_version int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line public.purchase_lines;
  v_rev public.daily_sheet_revisions;
  v_sheet public.daily_sheets;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'سبب الإلغاء مطلوب' using errcode = 'invalid_parameter_value';
  end if;
  perform public.assert_session('sheet.edit');
  select * into v_line from public.purchase_lines where id = p_line_id for update;
  if not found then raise exception 'السطر غير موجود' using errcode = 'no_data_found'; end if;
  select * into v_rev from public.daily_sheet_revisions where id = v_line.revision_id for update;
  select * into v_sheet from public.daily_sheets where id = v_rev.daily_sheet_id for update;

  if v_sheet.status <> 'draft' or v_rev.status <> 'draft' then
    raise exception 'لا يمكن الإلغاء بعد التقديم' using errcode = 'check_violation';
  end if;
  if v_sheet.version <> p_expected_version then
    raise exception 'CONFLICT_VERSION' using errcode = 'serialization_failure';
  end if;

  delete from public.purchase_dispositions where purchase_line_id = p_line_id;

  update public.purchase_lines set
    purchase_status = 'cancelled',
    cancellation_reason = p_reason,
    basket_unit_price = null,
    purchased_quantity = 0,
    updated_at = now()
  where id = p_line_id;

  update public.daily_sheets set version = version + 1 where id = v_sheet.id;
  update public.daily_sheet_revisions set version = version + 1 where id = v_rev.id;

  perform public.write_audit('purchase_line.cancelled','purchase_line',p_line_id,v_rev.id,p_reason,
    jsonb_build_object('quantity', v_line.purchased_quantity, 'price', v_line.basket_unit_price), null);

  return jsonb_build_object('version', v_sheet.version + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- إعداد الطلبات الليلية (لا أثر مالي)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_night_order(
  p_business_date date,
  p_store_id uuid,
  p_lines jsonb,
  p_submit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_session('night_order.edit');
  v_order public.night_orders;
  v_item jsonb;
begin
  if not exists (select 1 from public.stores where id = p_store_id and active) then
    raise exception 'البقالة غير متاحة' using errcode = 'no_data_found';
  end if;

  insert into public.night_orders (business_date, store_id, status, created_by)
  values (p_business_date, p_store_id, 'draft', v_uid)
  on conflict (business_date, store_id) do update
    set updated_at = now()
  returning * into v_order;

  if v_order.status = 'cancelled' then
    raise exception 'الطلب ملغى' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    insert into public.night_order_lines (night_order_id, product_id, quantity, note)
    values (
      v_order.id,
      (v_item->>'product_id')::uuid,
      coalesce((v_item->>'quantity')::numeric, 0),
      v_item->>'note'
    )
    on conflict (night_order_id, product_id) do update
      set quantity = excluded.quantity,
          note = excluded.note;
  end loop;

  if p_submit then
    update public.night_orders set status = 'submitted', submitted_at = now()
      where id = v_order.id;
  end if;

  return jsonb_build_object('order_id', v_order.id, 'status', case when p_submit then 'submitted' else 'draft' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- تحقق جاهزية الإصدار — ترجع أخطاء completeness
-- ---------------------------------------------------------------------------
create or replace function public.check_revision_readiness(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rev public.daily_sheet_revisions;
  v_errors jsonb := '[]'::jsonb;
  v_line record;
  v_sum numeric(12,3);
  v_purchase numeric(14,2) := 0;
  v_distributed numeric(14,2) := 0;
  v_inventory numeric(14,2) := 0;
  v_damaged numeric(14,2) := 0;
  v_purchase_qty numeric(12,3) := 0;
  v_active_lines int := 0;
begin
  select * into v_rev from public.daily_sheet_revisions where id = p_revision_id;
  if not found then raise exception 'الإصدار غير موجود' using errcode = 'no_data_found'; end if;

  for v_line in
    select pl.*, p.name as product_name, s.name as supplier_name
    from public.purchase_lines pl
    join public.products p on p.id = pl.product_id
    left join public.suppliers s on s.id = pl.supplier_id
    where pl.revision_id = p_revision_id
    order by pl.line_no
  loop
    if v_line.purchase_status = 'cancelled' then
      continue;
    end if;
    v_active_lines := v_active_lines + 1;

    if not exists (select 1 from public.products where id = v_line.product_id and active) then
      v_errors := v_errors || jsonb_build_object('line_id', v_line.id, 'code', 'PRODUCT_INACTIVE', 'message', 'الصنف غير مفعل');
    end if;
    if v_line.purchase_status = 'purchased' and v_line.supplier_id is null then
      v_errors := v_errors || jsonb_build_object('line_id', v_line.id, 'code', 'SUPPLIER_REQUIRED', 'message', 'المورد مطلوب للسطر المشترى');
    end if;
    if v_line.purchase_status = 'purchased' and v_line.basket_unit_price is null then
      v_errors := v_errors || jsonb_build_object('line_id', v_line.id, 'code', 'PRICE_REQUIRED', 'message', 'السعر مطلوب');
    end if;
    if v_line.purchase_status = 'purchased' and v_line.purchased_quantity <= 0 then
      v_errors := v_errors || jsonb_build_object('line_id', v_line.id, 'code', 'QUANTITY_REQUIRED', 'message', 'الكمية يجب أن تكون أكبر من صفر');
    end if;

    select coalesce(sum(quantity),0) into v_sum
    from public.purchase_dispositions where purchase_line_id = v_line.id;

    if v_line.purchase_status = 'purchased'
       and abs(v_sum - v_line.purchased_quantity) > 0.0005 then
      v_errors := v_errors || jsonb_build_object(
        'line_id', v_line.id,
        'code', 'UNCLASSIFIED_QUANTITY',
        'message', format('الكمية غير مصنفة: مشتراة %، موزعة %', v_line.purchased_quantity, v_sum)
      );
    end if;

    if v_line.purchase_status = 'purchased' then
      v_purchase_qty := v_purchase_qty + v_line.purchased_quantity;
      v_purchase := v_purchase + round(v_line.purchased_quantity * v_line.basket_unit_price, 2);
    end if;

  end loop;

  if v_active_lines = 0 then
    v_errors := v_errors || jsonb_build_object('code', 'EMPTY_REVISION', 'message', 'لا يوجد أي سطر شراء');
  end if;

  select
    coalesce(sum(d.quantity*d.unit_cost),0)
  into v_distributed
  from public.purchase_dispositions d
  join public.purchase_lines l on l.id = d.purchase_line_id
  where l.revision_id = p_revision_id and d.disposition_type = 'store_distribution';

  select coalesce(sum(d.quantity*d.unit_cost),0) into v_inventory
  from public.purchase_dispositions d
  join public.purchase_lines l on l.id = d.purchase_line_id
  where l.revision_id = p_revision_id and d.disposition_type = 'inventory_remaining';

  select coalesce(sum(d.quantity*d.unit_cost),0) into v_damaged
  from public.purchase_dispositions d
  join public.purchase_lines l on l.id = d.purchase_line_id
  where l.revision_id = p_revision_id and d.disposition_type = 'damaged';

  if round(v_purchase,2) <> round(v_distributed + v_inventory + v_damaged, 2) then
    v_errors := v_errors || jsonb_build_object(
      'code', 'COST_MISMATCH',
      'message', format('تكلفة الشراء % لا تساوي مجموع التوزيع/المخزون/التلف %',
        round(v_purchase,2), round(v_distributed+v_inventory+v_damaged,2))
    );
  end if;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'total_purchase_value', round(v_purchase,2),
    'total_distributed_value', round(v_distributed,2),
    'total_inventory_value', round(v_inventory,2),
    'total_damaged_value', round(v_damaged,2),
    'total_purchase_quantity', v_purchase_qty
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_revision: draft → ready_for_review
-- ---------------------------------------------------------------------------
create or replace function public.submit_revision(p_revision_id uuid, p_expected_version int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.assert_session('sheet.submit');
  v_rev public.daily_sheet_revisions;
  v_sheet public.daily_sheets;
  v_check jsonb;
begin
  select * into v_rev from public.daily_sheet_revisions where id = p_revision_id for update;
  if not found then raise exception 'الإصدار غير موجود' using errcode = 'no_data_found'; end if;
  select * into v_sheet from public.daily_sheets where id = v_rev.daily_sheet_id for update;

  if v_sheet.version <> p_expected_version then
    raise exception 'CONFLICT_VERSION' using errcode = 'serialization_failure';
  end if;
  if v_sheet.status <> 'draft' or v_rev.status <> 'draft' then
    raise exception 'حالة اليومية لا تسمح بالتقديم' using errcode = 'check_violation';
  end if;

  v_check := public.check_revision_readiness(p_revision_id);
  if not (v_check->>'ready')::boolean then
    raise exception 'READINESS_FAILED: %', v_check::text using errcode = 'check_violation';
  end if;

  update public.daily_sheet_revisions set
    status = 'ready_for_review',
    total_purchase_value = (v_check->>'total_purchase_value')::numeric,
    total_distributed_value = (v_check->>'total_distributed_value')::numeric,
    total_inventory_value = (v_check->>'total_inventory_value')::numeric,
    total_damaged_value = (v_check->>'total_damaged_value')::numeric,
    reviewed_by = v_uid
  where id = p_revision_id;

  update public.daily_sheets set
    status = 'ready_for_review', submitted_by = v_uid, version = version + 1
  where id = v_sheet.id;

  insert into public.daily_sheet_events (daily_sheet_id, revision_id, from_status, to_status, actor_id)
  values (v_sheet.id, p_revision_id, v_sheet.status::text, 'ready_for_review', v_uid);

  perform public.write_audit('sheet.submitted','daily_sheet',v_sheet.id,p_revision_id,null,
    jsonb_build_object('check', v_check));

  return jsonb_build_object('status','ready_for_review','version', v_sheet.version + 1,'check', v_check);
end;
$$;

-- ---------------------------------------------------------------------------
-- post_revision: ready_for_review → posted + قيود دفتر ذرية + idempotency
-- ---------------------------------------------------------------------------
create or replace function public.post_revision(
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
  v_check jsonb;
  v_entry public.journal_entries;
  v_line record;
  v_disp record;
  v_dist_total numeric(14,2) := 0;
  v_inv_total numeric(14,2) := 0;
  v_dmg_total numeric(14,2) := 0;
  v_pur_total numeric(14,2) := 0;
  v_sup uuid;
  v_amt numeric(14,2);
  v_key text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'idempotency key مطلوب' using errcode = 'invalid_parameter_value';
  end if;

  -- idempotency: نفس المفتاح لنفس الإصدار يعيد النتيجة دون تكرار
  select * into v_entry from public.journal_entries
    where idempotency_key = p_idempotency_key;
  if found then
    if v_entry.source_id is distinct from p_revision_id then
      raise exception 'IDEMPOTENCY_CONFLICT: المفتاح مستخدم لطلب مختلف' using errcode = 'unique_violation';
    end if;
    return jsonb_build_object(
      'status','posted','idempotent',true,'journal_entry_id', v_entry.id,
      'idempotency_key', p_idempotency_key
    );
  end if;

  select * into v_rev from public.daily_sheet_revisions where id = p_revision_id for update;
  if not found then raise exception 'الإصدار غير موجود' using errcode = 'no_data_found'; end if;
  select * into v_sheet from public.daily_sheets where id = v_rev.daily_sheet_id for update;

  if v_rev.status = 'posted' then
    raise exception 'ALREADY_POSTED: الإصدار معتمد مسبقًا' using errcode = 'unique_violation';
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

  if not exists (select 1 from public.accounting_accounts where code = '1200')
     or not exists (select 1 from public.accounting_accounts where code = '1100')
     or not exists (select 1 from public.accounting_accounts where code = '2100')
     or not exists (select 1 from public.accounting_accounts where code = '5100') then
    raise exception 'دليل الحسابات غير مكتمل' using errcode = 'no_data_found';
  end if;

  v_key := p_idempotency_key;

  -- معاملة اعتماد اليومية: قيد شراء + قيود توزيع/تلف
  insert into public.journal_entries (
    source_type, source_id, source_revision_id, entry_kind, effective_date,
    idempotency_key, posted_by, description
  ) values (
    'daily_revision', p_revision_id, p_revision_id, 'purchase', v_sheet.business_date,
    v_key, v_uid, 'اعتماد اليومية ' || v_sheet.business_date::text
  ) returning * into v_entry;

  -- موردون: credit ذموم الموردين بإجمالي كل مورد (مع تفصيل السطور)
  for v_line in
    select pl.* from public.purchase_lines pl
    where pl.revision_id = p_revision_id and pl.purchase_status = 'purchased'
    order by pl.line_no
  loop
    v_amt := round(v_line.purchased_quantity * v_line.basket_unit_price, 2);
    v_pur_total := v_pur_total + v_amt;
    if v_amt > 0 and v_line.supplier_id is not null then
      insert into public.journal_lines (
        journal_entry_id, account_id, debit, credit, supplier_id, product_id, purchase_line_id, revision_id, description
      ) values (
        v_entry.id, public.account_id('1200'), v_amt, 0, v_line.supplier_id, v_line.product_id, v_line.id, p_revision_id,
        'شراء ' || v_line.purchased_quantity || ' سلة'
      );
      insert into public.journal_lines (
        journal_entry_id, account_id, debit, credit, supplier_id, product_id, purchase_line_id, revision_id, description
      ) values (
        v_entry.id, public.account_id('2100'), 0, v_amt, v_line.supplier_id, v_line.product_id, v_line.id, p_revision_id,
        'ذمة مورد آجلة'
      );
      v_sup := v_line.supplier_id;
    end if;
  end loop;

  for v_disp in
    select d.*, pl.supplier_id, pl.basket_unit_price
    from public.purchase_dispositions d
    join public.purchase_lines pl on pl.id = d.purchase_line_id
    where pl.revision_id = p_revision_id
  loop
    if v_disp.disposition_type = 'store_distribution' then
      v_amt := round(v_disp.quantity * v_disp.unit_cost, 2);
      v_dist_total := v_dist_total + v_amt;
      insert into public.journal_lines (
        journal_entry_id, account_id, debit, credit, store_id, supplier_id, product_id, purchase_line_id, revision_id, description
      ) values (
        v_entry.id, public.account_id('1100'), v_amt, 0, v_disp.store_id, v_disp.supplier_id,
        (select product_id from public.purchase_lines where id = v_disp.purchase_line_id),
        v_disp.purchase_line_id, p_revision_id, 'تحميل بقالة'
      );
      insert into public.journal_lines (
        journal_entry_id, account_id, debit, credit, store_id, supplier_id, product_id, purchase_line_id, revision_id, description
      ) values (
        v_entry.id, public.account_id('1200'), 0, v_amt, v_disp.store_id, v_disp.supplier_id,
        (select product_id from public.purchase_lines where id = v_disp.purchase_line_id),
        v_disp.purchase_line_id, p_revision_id, 'صرف من المخزون للبقالة'
      );
    elsif v_disp.disposition_type = 'damaged' then
      v_amt := round(v_disp.quantity * v_disp.unit_cost, 2);
      v_dmg_total := v_dmg_total + v_amt;
      insert into public.journal_lines (
        journal_entry_id, account_id, debit, credit, supplier_id, product_id, purchase_line_id, revision_id, description
      ) values (
        v_entry.id, public.account_id('5100'), v_amt, 0, v_disp.supplier_id,
        (select product_id from public.purchase_lines where id = v_disp.purchase_line_id),
        v_disp.purchase_line_id, p_revision_id, 'خسارة تلف'
      );
      insert into public.journal_lines (
        journal_entry_id, account_id, debit, credit, supplier_id, product_id, purchase_line_id, revision_id, description
      ) values (
        v_entry.id, public.account_id('1200'), 0, v_amt, v_disp.supplier_id,
        (select product_id from public.purchase_lines where id = v_disp.purchase_line_id),
        v_disp.purchase_line_id, p_revision_id, 'خروج مخزون تالف'
      );
    elsif v_disp.disposition_type = 'inventory_remaining' then
      v_inv_total := v_inv_total + round(v_disp.quantity * v_disp.unit_cost, 2);
      -- لا قيد: يبقى داخل 1200 كأصل مخزون
    end if;
  end loop;

  -- تحقق النهايات: مجموع التوزيع + المخزون + التلف = قيمة الشراء
  if round(v_dist_total + v_inv_total + v_dmg_total, 2) <> round(v_pur_total, 2) then
    raise exception 'RECONCILIATION_FAILED: شراء % ≠ موزع % + مخزون % + تلف %',
      v_pur_total, v_dist_total, v_inv_total, v_dmg_total using errcode = 'check_violation';
  end if;

  update public.daily_sheet_revisions set
    status = 'posted',
    posted_by = v_uid,
    posted_at = now(),
    total_purchase_value = round(v_pur_total,2),
    total_distributed_value = round(v_dist_total,2),
    total_inventory_value = round(v_inv_total,2),
    total_damaged_value = round(v_dmg_total,2)
  where id = p_revision_id;

  update public.daily_sheets set
    status = 'posted', posted_by = v_uid, posted_at = now(), version = version + 1
  where id = v_sheet.id;

  insert into public.daily_sheet_events (daily_sheet_id, revision_id, from_status, to_status, actor_id)
  values (v_sheet.id, p_revision_id, v_sheet.status::text, 'posted', v_uid);

  perform public.write_audit('sheet.posted','daily_sheet',v_sheet.id,p_revision_id,null,
    null,
    jsonb_build_object(
      'purchase', v_pur_total, 'distributed', v_dist_total,
      'inventory', v_inv_total, 'damaged', v_dmg_total,
      'journal_entry_id', v_entry.id
    ));

  return jsonb_build_object(
    'status','posted','idempotent',false,
    'journal_entry_id', v_entry.id,
    'purchase_total', v_pur_total,
    'distributed_total', v_dist_total,
    'inventory_total', v_inv_total,
    'damaged_total', v_dmg_total
  );
end;
$$;
