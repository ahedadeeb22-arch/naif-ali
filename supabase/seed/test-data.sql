-- ============================================================================
-- test-data.sql — بيانات اختبار اصطناعية (TEST ONLY)
-- ⚠️  لا تُحمّل في الإنتاج. راجع DECISIONS.md §I-11.
-- * لا تحتوي بيانات الجمعة الأصلية (غير متاحة). هذه بـfixtures اصطناعية.
-- * تواريخ الاختبار: 2026-01-10.
-- * لا تُنشئ مستخدمي auth؛ تفرض وجود مستخدم admin واحد لتسجيل created_by.
--   إن لم يوجد، يمكن تشغيلها بحساب admin بعد تطبيق migrations.
--   للاختبارات المحلية: supabase db reset مرّتين أو بعد إنشاء مستخدم admin.
-- ============================================================================

do $$
declare
  v_admin uuid;
  v_sheet public.daily_sheets;
  v_rev public.daily_sheet_revisions;
  v_line uuid;
begin
  select user_id into v_admin from public.profiles where role = 'admin' and active limit 1;
  if v_admin is null then
    raise notice 'TEST-DATA SKIPPED: no admin profile exists yet. Create an admin user, then re-run supabase/seed/test-data.sql';
    return;
  end if;

  -- تنظيف الجولة السابقة لنفس تاريخ الاختبار فقط
  delete from public.daily_sheet_events where daily_sheet_id in (select id from public.daily_sheets where business_date = '2026-01-10');
  delete from public.purchase_dispositions where purchase_line_id in (
    select id from public.purchase_lines where revision_id in (
      select id from public.daily_sheet_revisions where daily_sheet_id in (
        select id from public.daily_sheets where business_date = '2026-01-10')));
  delete from public.purchase_lines where revision_id in (
    select id from public.daily_sheet_revisions where daily_sheet_id in (
      select id from public.daily_sheets where business_date = '2026-01-10'));
  update public.daily_sheets set current_revision_id = null where business_date = '2026-01-10';
  delete from public.daily_sheet_revisions where daily_sheet_id in (
    select id from public.daily_sheets where business_date = '2026-01-10');
  delete from public.daily_sheets where business_date = '2026-01-10';
  delete from public.night_order_lines where night_order_id in (
    select id from public.night_orders where business_date = '2026-01-10');
  delete from public.night_orders where business_date = '2026-01-10';

  -- مسودة يوم اختبار
  insert into public.daily_sheets (business_date, status, created_by)
  values ('2026-01-10', 'draft', v_admin)
  returning * into v_sheet;

  insert into public.daily_sheet_revisions (daily_sheet_id, revision_no, status, business_date_snapshot, created_by)
  values (v_sheet.id, 1, 'draft', '2026-01-10', v_admin)
  returning * into v_rev;

  update public.daily_sheets set current_revision_id = v_rev.id where id = v_sheet.id;

  -- سطر أمين: 2 × 30 = 60
  insert into public.purchase_lines (
    revision_id, product_id, supplier_id, purchase_status, purchased_quantity, basket_unit_price, line_no, created_by
  ) values (
    v_rev.id,
    (select id from public.products where code = 'P01'),
    (select id from public.suppliers where name = 'أمين'),
    'purchased', 2, 30, 1, v_admin
  ) returning id into v_line;

  insert into public.purchase_dispositions (purchase_line_id, disposition_type, store_id, quantity, unit_cost)
  values
    (v_line, 'store_distribution', (select id from public.stores where code = 'ص'), 1, 30),
    (v_line, 'store_distribution', (select id from public.stores where code = 'ح'), 1, 30);

  -- سطر فارس: 1.5 × 36 = 54
  insert into public.purchase_lines (
    revision_id, product_id, supplier_id, purchase_status, purchased_quantity, basket_unit_price, line_no, created_by
  ) values (
    v_rev.id,
    (select id from public.products where code = 'P01'),
    (select id from public.suppliers where name = 'فارس'),
    'purchased', 1.5, 36, 2, v_admin
  ) returning id into v_line;

  insert into public.purchase_dispositions (purchase_line_id, disposition_type, store_id, quantity, unit_cost)
  values
    (v_line, 'store_distribution', (select id from public.stores where code = 'ص'), 1, 36),
    (v_line, 'store_distribution', (select id from public.stores where code = 'س'), 0.25, 36),
    (v_line, 'inventory_remaining', null, 0.25, 36);

  -- طلب ليلي بقالة الصفا (ليس ابتزامًا ماليًا)
  insert into public.night_orders (business_date, store_id, status, created_by)
  values ('2026-01-10', (select id from public.stores where code = 'ص'), 'submitted', v_admin);

  insert into public.night_order_lines (night_order_id, product_id, quantity)
  select id, (select id from public.products where code = 'P01'), 2
  from public.night_orders where business_date = '2026-01-10';

  raise notice 'TEST-DATA loaded for 2026-01-10 (TEST ONLY). Draft revision id: %', v_rev.id;
end $$;
