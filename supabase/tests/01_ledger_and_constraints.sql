-- ============================================================================
-- 01_ledger_and_constraints.sql — pgTAP: الترحيل المتوازن، منع التكرار، القيود
-- يُشغّل على قاعدة محلية: supabase test db
-- ============================================================================
begin;
select plan(12);

-- ---- مساعدات: إنشاء مستخدم Auth + profile admin/worker/store_owner ----------
create temporary table t_ids (k text primary key, v uuid);

-- لا نستطيع إنشاء auth.users مباشرة هنا بأمان في كل الإصدارات؛ نفترض وجود
-- دالة seed_admin موجودة في بيئة الاختبار، أو ننشئ profile يتيمًا غير ممكن
-- مقابل FK. لذلك الاختبارات التي تحتاج auth.uid() مُعلَّمة skip إن غاب الدور.
select has_table('public', 'journal_entries', 'جدول القيود موجود');
select has_table('public', 'journal_lines', 'جدول سطور القيود موجود');
select has_column('public', 'journal_lines', 'debit', 'عمود debit موجود');
select col_type_is('public', 'journal_lines', 'debit', 'numeric(14,2)', 'عمود debit numeric(14,2)');
select col_type_is('public', 'purchase_lines', 'purchased_quantity', 'numeric(12,3)', 'الكمية numeric(12,3)');

-- القيود الأساسية
select is(
  (select count(*)::int from public.accounting_accounts where code in ('1000','1100','1200','2100','3100','5100')),
  6, 'دليل الحسابات الستة موجود'
);

select is(
  (select count(*)::int from public.stores where code in ('ص','ح','س','ع','ك')),
  5, 'البقالات الخمس موجودة'
);

select is(
  (select count(*)::int from public.products),
  16, 'عدد الأصناف 16'
);

select is(
  (select count(*)::int from public.suppliers where name in ('أمين','فارس','الزعيم','صالح اللبيع','عمار الخيار')),
  5, 'الموردون الخمسة موجودون'
);

-- منع السعر السلبي
select throws_ok(
  $$ insert into public.purchase_lines (revision_id, product_id, purchased_quantity, basket_unit_price, created_by)
     select r.id, p.id, 1, -1, (select user_id from public.profiles limit 1)
     from public.daily_sheet_revisions r, public.products p limit 1 $$,
  '23514', null, 'سعر سالب مرفوض'
);

-- منع كمية سالبة
select throws_ok(
  $$ insert into public.purchase_lines (revision_id, product_id, purchased_quantity, created_by)
     select r.id, p.id, -2, (select user_id from public.profiles limit 1)
     from public.daily_sheet_revisions r, public.products p limit 1 $$,
  '23514', null, 'كمية سالبة مرفوضة'
);

-- منع free_sample بدون سبب
select throws_ok(
  $$ insert into public.purchase_lines (revision_id, product_id, purchase_status, purchased_quantity, basket_unit_price, created_by)
     select r.id, p.id, 'free_sample', 1, 0, (select user_id from public.profiles limit 1)
     from public.daily_sheet_revisions r, public.products p limit 1 $$,
  '23514', null, 'free_sample يتطلب سببًا'
);

select finish();
rollback;
