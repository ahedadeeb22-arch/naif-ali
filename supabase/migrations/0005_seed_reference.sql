-- ============================================================================
-- 0005_seed_reference.sql — بيانات مرجعية أولية (غير سرية)
-- * البقالات الخمس، 16 صنفًا، الموردون الخمسة (SPEC.md §2).
-- * دليل الحسابات المختصر (DECISIONS I-01/I-02).
-- * الصلاحيات الافتراضية لكل دور (SECURITY.md §2).
-- * لا مستخدمين ولا بيانات مالية. البيانات المالية التجريبية في
--   supabase/test-data.sql (TEST ONLY) وليست هنا.
-- ============================================================================

insert into public.accounting_accounts (code, name, account_type) values
  ('1000', 'النقد والبنك', 'asset'),
  ('1100', 'ذم البقالات', 'asset'),
  ('1200', 'المخزون / مشتريات', 'asset'),
  ('2100', 'ذم الموردين', 'liability'),
  ('3100', 'الحقوق الافتتاحية', 'equity'),
  ('5100', 'خسائر التلف', 'expense')
on conflict (code) do update set name = excluded.name, account_type = excluded.account_type;

insert into public.permissions (code, description) values
  ('sheet.create', 'إنشاء مسودة يومية'),
  ('sheet.edit', 'تحرير سطور مسودة اليومية'),
  ('sheet.submit', 'تقديم اليومية للمراجعة'),
  ('sheet.approve', 'اعتماد وترحيل اليومية (مدير افتراضيًا)'),
  ('sheet.reopen', 'إعادة فتح يومية مرحّلة (مدير)'),
  ('voucher.create', 'إنشاء سندات قبض/صرف'),
  ('voucher.reverse', 'عكس سند مرحّل'),
  ('catalog.manage', 'إدارة البقالات/الموردين/الأصناف'),
  ('opening.manage', 'إدارة الأرصدة الافتتاحية'),
  ('night_order.edit', 'إنشاء وتحرير طلبات الليل'),
  ('report.read', 'قراءة تقارير وكشوف إدارية'),
  ('audit.read', 'قراءة سجل التدقيق')
on conflict (code) do update set description = excluded.description;

-- الأدوار الافتراضية:
-- admin: كل شيء (يُعامَل كمدير في الكود والدوال)
-- worker: إنشاء/تحرير/تقديم اليومية وطلبات الليل
-- store_owner: لا شيء هنا؛ قراءته محصورة بـRLS/membership فقط
insert into public.role_permissions (role, permission_code) values
  ('admin', 'sheet.create'), ('admin','sheet.edit'), ('admin','sheet.submit'),
  ('admin','sheet.approve'), ('admin','sheet.reopen'),
  ('admin','voucher.create'), ('admin','voucher.reverse'),
  ('admin','catalog.manage'), ('admin','opening.manage'),
  ('admin','night_order.edit'), ('admin','report.read'), ('admin','audit.read'),
  ('worker', 'sheet.create'), ('worker','sheet.edit'), ('worker','sheet.submit'),
  ('worker', 'night_order.edit')
on conflict (role, permission_code) do nothing;

insert into public.stores (code, name, sort_order) values
  ('ص', 'بقالة الصفا', 1),
  ('ح', 'بقالة الخير', 2),
  ('س', 'بقالة السعادة', 3),
  ('ع', 'بقالة العروبة', 4),
  ('ك', 'بقالة الكرامة', 5)
on conflict (code) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.products (code, name, unit_name, sort_order) values
  ('P01','طماط','سلة',1), ('P02','بطاط','سلة',2), ('P03','بصل','سلة',3),
  ('P04','كوبش','سلة',4), ('P05','جزر','سلة',5), ('P06','بيبار','سلة',6),
  ('P07','بسباس','سلة',7), ('P08','باميه','سلة',8), ('P09','كوسه','سلة',9),
  ('P10','اسود','سلة',10), ('P11','ليم','سلة',11), ('P12','خيار','سلة',12),
  ('P13','موز','سلة',13), ('P14','ثومه','سلة',14), ('P15','عربيه','سلة',15),
  ('P16','بيض','سلة',16)
on conflict (code) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.suppliers (name) values
  ('أمين'), ('فارس'), ('الزعيم'), ('صالح اللبيع'), ('عمار الخيار')
on conflict (name) do nothing;
