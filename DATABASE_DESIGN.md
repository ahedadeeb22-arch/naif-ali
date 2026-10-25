# تصميم قاعدة البيانات المقترح
> تصميم منطقي وليس SQL تنفيذيًا. الأنواع أسماء PostgreSQL. يثبت schema نهائيًا بمراجعة قبل كتابة أي migration. جميع الجداول التشغيلية تحمل `id uuid`، `created_at timestamptz`, `created_by uuid` حيث ينطبق، وعلاقات FK صريحة. البيانات المؤرشفة تُعطل ولا تحذف إذا استُخدمت ماليًا.

## 1. مبادئ النمذجة
1. فصل الطلب التنبؤي عن الشراء الفعلي وعن التوزيع وعن السندات.
2. دفتر مالي مركزي immutable هو مصدر الأرصدة؛ لا تخزن رصيدًا جاريًا على المورد والبقالة واليومية بالتوازي. يمكن لاحقًا إنشاء view/materialized projection قابلة لإعادة البناء والمطابقة.
3. النسخة المنشورة من اليومية ثابتة؛ التعديل إصدار جديد مع قيد عكس/فرق، لا UPDATE لقيد سابق.
4. كمية `numeric(12,3)`، سعر الوحدة/السلة ومبالغ الحركة `numeric(14,2)` أو دقة داخلية أعلى ثم مقدار مقرب. العملات مخطط لها عملة واحدة مع `currency_code char(3)` عند الحاجة؛ قرار العملة مطلوب.
5. التوقيت UTC في DB، وتاريخ التشغيل `business_date date` حسب منطقة زمنية يعتمدها المالك. مرجع محلي ثابت لتقارير حدود اليوم.
6. FK مع `ON DELETE RESTRICT` للبيانات التاريخية، uniqueness وcheck constraints لكل قواعد المجال الممكنة.

## 2. الهوية والمرجعيات
### `profiles`
`user_id uuid PK FK auth.users`, `display_name text`, `active boolean`, `created_at`, `updated_at`. لا يخزن الدور الموثوق فقط في metadata قابلة للعميل.

### `roles`, `permissions`, `role_permissions`
`roles(id, code unique, name)` للأدوار الأساسية admin/worker/store_owner؛ `permissions(id, code unique, description)`؛ ربط M:N بمفتاح مركب. صلاحيات العامل الإضافية تُمنح بجدول `user_permission_overrides(user_id, permission_id, allowed, granted_by, created_at)` مع منع تجاوز قواعد قاعدة البيانات الأساسية. لا يحوّل override دور صاحب البقالة إلى مدير.

### `stores`
`id`, `code text unique`, `name`, `sort_order int`, `active boolean`, `created_at`, `updated_at`. حذف مقيّد بوجود معاملات؛ تغيير الرمز لا يغير FK التاريخية.

### `store_memberships`
`user_id FK profiles`, `store_id FK stores`, `active`, `created_at`, `created_by`; PK مركب (user_id, store_id). هذا الربط وحده يحدد نطاق بوابة صاحب البقالة.

### `suppliers`
`id`, `code nullable unique`, `name`, `active`, `notes`, timestamps. تعطيل لا حذف بعد الارتباط.

### `products`
`id`, `code nullable unique`, `name`, `unit_name` (السلة تعريف عملي، والوحدة/تحويلها يحتاج اعتماد), `sort_order`, `active`, timestamps.

### `accounting_accounts`
دليل حسابات مختصر: `id`, `code unique`, `name`, `account_type` (asset/liability/equity/revenue/expense)، `active`. حد أدنى: ذمم موردين، ذمم بقالات، نقد/بنك، مخزون متبقٍ، خسارة تلف، فروقات/تسويات، أرصدة افتتاحية/حقوق افتتاحية. اعتماد الدليل التجاري/المحاسبي قبل البناء.

## 3. طلبات الليل
### `night_orders`
`id`, `business_date date`, `store_id`, `status (draft/submitted/cancelled)`, `version int`, `created_by`, `submitted_at`, `created_at`, `updated_at`; unique (business_date, store_id, active order semantics) عبر قيد/فهرس جزئي بعد تحديد تعدد الإصدارات.

### `night_order_lines`
`id`, `night_order_id FK`, `product_id FK`, `quantity numeric(12,3) CHECK >=0`, `note`, `created_at`; unique (night_order_id, product_id) أو يدعم صفوف متعددة بسبب/طلب مستقل بعد تحديد تجربة المستخدم. الطلب لا يرتبط بقيود ledger.

## 4. اليومية والإصدارات
### `daily_sheets`
`id`, `business_date date unique` (سجل جذري واحد لليوم)، `status enum/check draft, ready_for_review, posted, closed, cancelled`, `current_revision_id uuid nullable`, `version int`, `created_by`, `submitted_by`, `posted_by`, `closed_by`, `posted_at`, `closed_at`, timestamps. جدول اليوم الجذري لا يستبدل مع إعادة المراجعة.

### `daily_sheet_revisions`
`id`, `daily_sheet_id FK`, `revision_no int`, `based_on_revision_id FK nullable`, `status (draft, ready_for_review, posted, superseded, cancelled)`, `reason text`, `business_date_snapshot date`, `content_hash text`, `created_by`, `reviewed_by`, `posted_by`, `posted_at`, `created_at`; unique(daily_sheet_id, revision_no). كل ترحيل يشير إلى revision غير قابل للتغيير بعد نشره؛ المسودة تعدل قبل النشر مع version/lock.

### `purchase_lines`
`id`, `revision_id FK`, `product_id FK`, `supplier_id FK nullable`, `purchase_status (purchased, cancelled, free_sample)`, `purchased_quantity numeric(12,3)`, `basket_unit_price numeric(14,2) nullable`, `currency_code`, `note`, `cancellation_reason`, `free_reason`, timestamps/creator. قيد حسب الحالة: المشتَرى يتطلب موردًا وكمية >0 وسعرًا غير NULL؛ السعر صفر لا يثبت المجانية وحده؛ المجاني يتطلب سببًا وسعر شراء 0 أو قواعد تمثل كمية مجانية منفصلة. صف ملغى لا يدخل المبالغ. المشتريات المتعددة من الموردين صفوف منفصلة.

### `purchase_dispositions`
يمثل كل كمية من مصدر الشراء: `id`, `purchase_line_id FK`, `disposition_type (store_distribution, inventory_remaining, damaged, supplier_free_quantity, other_approved)`, `store_id FK nullable`, `quantity numeric(12,3)`, `unit_cost numeric(14,2)` snapshot، `reason`, `approved_by nullable`, `created_at`. نوع store_distribution يتطلب store_id؛ غيره لا يتطلبه وفق النوع. مجموع الكميات لكل سطر يجب أن يساوي المشتراة عند الجاهزية/الترحيل، مع استثناء موثق للكميات المجانية التي لا تدخل تكلفة المورد. التحقق عبر إجراء transactional لا CHECK تجميعي فقط.

ملاحظة: `unit_cost` snapshot يساوي سعر السلة لو الوحدة هي السلة؛ إن اختلفت وحدة الكمية يجب تسمية الحقل وسعر التحويل بوضوح. سطر السعر الفارغ يظل مسودة غير قابلة للنشر.

### `daily_sheet_events` (اختياري/مفيد)
`id`, `daily_sheet_id`, `revision_id`, `from_status`, `to_status`, `actor_id`, `reason`, `created_at`, `request_id`. يمكن أن تكون هذه الأحداث ضمن audit، لكن جدول الانتقالات يسهل إظهار تاريخ الحالة مع append-only.

## 5. دفتر الأستاذ والحركات
### `journal_entries`
رأس القيد: `id`, `entry_no` unique، `source_type`, `source_id`, `source_revision_id nullable`, `entry_kind (opening, purchase, store_charge, supplier_payment, store_receipt, reversal, adjustment, inventory, damage, other)`, `effective_date date`, `status (posted, reversed)`, `reversal_of_id FK nullable`, `idempotency_key text unique`, `posted_by`, `posted_at`, `description`, `created_at`. unique مناسب على (source_type, source_id, source_revision_id, entry_kind) يمنع تكرار الأثر المحدد، مع السماح بقيود تعديل متعددة ذات معرفات تفردها.

### `journal_lines`
`id`, `journal_entry_id FK`, `account_id FK`, `debit numeric(14,2)`, `credit numeric(14,2)`, `store_id nullable FK`, `supplier_id nullable FK`, `product_id nullable FK`, `purchase_line_id nullable FK`, `description`; CHECK غير سالب، لا يكون المدين والدائن غير صفريين معًا، كل قيد متوازن بعد اعتماد العملة. فهارس على الطرف والتاريخ، الحساب/التاريخ، source. قيد توازن إجمالي متعدد الصفوف ينفذ داخل إجراء ترحيل/trigger deferred معاملةً واحدة.

المقترح المحاسبي يستخدم دفتر مزدوج القيد موحدًا. مثال تحميل 100 إلى بقالة: مدين ذمم البقالة 100 / دائن حساب مقابل المشتريات/المخزون وفق السياسة؛ شراء آجل من مورد 100: مدين مشتريات/مخزون 100 / دائن ذمم المورد 100. لا يقرر النظام مقابلة المشتريات مباشرة بين طرفي السوق والبقالة كأنها قبض/دفع. دليل الحسابات والسياسة النهائية تحتاج موافقة محاسب المالك. قد تسجل حركة تكلفة المشتراة مرة واحدة، وتوزيع المصدر ينقل القيمة بين المخزون/مصروف التلف/ذمم المتاجر عبر قيود مترابطة؛ يجب اعتماد هذا النموذج قبل التشغيل لتجنب إثبات المصروف مرتين.

### قاعدة مصدر الحقيقة
دفتر متوازن يثبت الالتزامات والتحصيل. لا تجمع شراء مورد وتحميل بقالة في حسابات متقابلة دون حساب وسيط/مخزون يفسر الملكية. التقرير التشغيلي لتكلفة الشراء/التوزيع يأتي من تفاصيل اليومية؛ أرصدة الأطراف من دفتر الأستاذ.

## 6. الأرصدة الافتتاحية
### `opening_balances`
`id`, `party_type (store/supplier)`, `store_id nullable`, `supplier_id nullable`, `account_id`, `cutoff_date`, `amount numeric(14,2)`, `currency_code`, `direction (debit/credit)`, `reason`, `status (draft/posted)`, `journal_entry_id FK nullable unique`, `created_by`, `approved_by`, timestamps. قيد CHECK يضمن طرفًا واحدًا فقط. لا تعديل مرحّل؛ التصحيح بقيد عكس/تسوية. ترحيلها ينشئ قيد افتتاحي متوازن بدليل الحسابات.

## 7. السندات
### `payment_vouchers`
جدول موحد: `id`, `voucher_no text unique`, `voucher_type (receipt_from_store, payment_to_supplier)`, `store_id nullable`, `supplier_id nullable`, `amount numeric(14,2) CHECK >0`, `currency_code`, `effective_date`, `method`, `reference_no`, `memo`, `status (draft, posted, reversed)`, `journal_entry_id FK unique nullable`, `idempotency_key unique`, `created_by`, `approved_by`, `posted_at`, `reversal_voucher_id nullable`, timestamps. CHECK أن طرفًا مطابقًا للنوع موجود وطرف الآخر NULL. السند المرحل immutable؛ الإلغاء بعكس مرتبط.

قيد المبلغ على الذمة المعنية مقابل نقد/بنك بحسب النوع؛ الدفعة الجزئية لا تعدل قيمة الشراء.

## 8. التدقيق وسلامة التزامن
### `audit_log`
`id bigserial/uuid`, `actor_id uuid nullable`, `action text`, `entity_type text`, `entity_id uuid`, `revision_id nullable`, `occurred_at timestamptz`, `request_id text`, `reason text`, `before_data jsonb nullable`, `after_data jsonb nullable`, `metadata jsonb`. Append-only بصلاحيات DB، وإخفاء/تنقيح أسرار وبيانات حساسة. التغييرات المالية تسجل في نفس المعاملة عند الإمكان. لا تضع بيانات Auth السرية.

### `idempotency_records` (عند الحاجة لطلبات عامة)
`scope`, `key`, `request_hash`, `result_reference`, `created_at`; PK(scope,key). رفض إعادة استخدام المفتاح بمحتوى مختلف. يمكن دمجه بقيود دفتر/السند إن غطت كل الأوامر.

### `version` وقيود تفرد
نسخة رقمية على مسودات اليومية/الطلب؛ التحديث `WHERE version = expected`, ثم زيادة. اعتماد يقفل سجل الجذر/الإصدار `FOR UPDATE` ويعيد فحص المجاميع والصلاحية. unique على يوم العمل، وترقيم إصدار فريد، ومفتاح idempotency فريد، ومصدر قيد فريد. retry بنفس المفتاح يعيد نفس المرجع. RLS لا يغني عن التحقق داخل إجراء الترحيل.

## 9. العلاقات الأساسية
- مستخدم 1:N أفعال؛ مستخدم M:N بقالات عبر membership.
- يوم عمل 1:1 daily_sheet؛ daily_sheet 1:N revisions؛ revision 1:N purchase_lines؛ purchase_line 1:N dispositions.
- بقالة 1:N طلبات يوم/سطور؛ مورد وصنف 1:N سطور شراء.
- كل distribution disposition ترتبط ببقالة واحدة وبسطر شراء واحد.
- revision المنشور 1:N journal entries (شراء، توزيع/تسوية)؛ journal entry 1:N journal lines؛ حساب طرفي يرتبط بالذمة.
- سند 0:1 قيد؛ قيد عكسي يشير إلى الأصل.
- افتتاحي طرف 0:1 قيد افتتاحي.

## 10. سياسات RLS المطلوبة (مبدأ لا SQL)
- تفعيل RLS على كل جدول مكشوف عبر API، واختبار التغطية آليًا.
- `profiles`: صاحب الحساب يقرأ بياناته المحدودة؛ المدير إدارة. الدور الحقيقي يستمد من جداول role/permission الموثوقة، لا من metadata.
- `store_memberships`: المستخدم يقرأ ربطه فقط؛ المدير يدير الربط.
- طلبات/حركات بقالة: صاحب البقالة يقرأ السجلات المنشورة فقط حيث `store_id IN memberships(auth.uid())`. لا يرى مسودات/بيانات الموردين أو البقالات الأخرى دون ضرورة.
- يومية/تفاصيل/موردون/مستخدمون/دفتر/سندات: المدير وفق السياسة؛ العامل صلاحيات محدودة على المسودات المخصصة/العمليات المسموحة. لا كتابة مباشرة من العميل إلى ledger أو audit.
- وظائف الترحيل تستخرج هوية الجلسة وتتحقق من صلاحية manager، ولا تثق بمعرف actor المرسل. تنفيذ أضيق صلاحية ممكن، والـ `service_role` لا يظهر في العميل. لا تملك الوظيفة نقطة عامة تسمح بانتحال الهوية.
- `audit_log` قراءة محدودة للمدير، وإدراج من خدمة موثوقة فقط، لا update/delete.

## 11. الفهارس والقيود
- unique `daily_sheets.business_date`، `(daily_sheet_id, revision_no)`، `stores.code`, `products.code`, voucher number، `journal_entries.idempotency_key`، معرف المصدر/النسخة/نوع الأثر.
- indexes على الحركات `(effective_date, store_id)`, `(effective_date, supplier_id)`, `(account_id,effective_date)`, اليومية (date,status)، السطور (revision, product/supplier)، الطلب (date,store)، audit (entity/time).
- CHECK للكميات غير السالبة، الأموال، طرف محدد للسند، سعر غير فارغ في صف الشراء المكتمل، أسباب الإلغاء/المجاني، ودائن/مدين لا يجتمعان.
- لا حذف متسلسل للدفتر/الطلبات المرحلة. تعطل السجل المرجعي لا يغير التاريخ.

## 12. المطابقة وإعادة البناء
- view لكشف الرصيد يحسب افتتاحي + ledger lines من بداية/نهاية الفترة، مع تعريف اتجاه الإشارة.
- تقرير validation دوري: مجموع debit=credit لكل قيد/عملة؛ صافي طرف من ledger يساوي كشفه؛ مجموع تكلفة سطور الشراء يساوي توزيعات/مخزون/تالف/تسوية؛ مجموع دفتر revision يطابق إجمالياته.
- أي materialized view مستقبلية تحمل وقت بناء/نسخة، يعاد بناؤها من دفتر المصدر ويقارن بها قبل استعمالها. لا يتم ترحيل حركة من view.

## 13. نقاط تتطلب تثبيتًا قبل migrations
العملة والمنازل العشرية/وحدة السلة، الحسابات المقابلة للمشتريات والمخزون، ضريبة ورسوم، قيود المجاني والتالف، منطقة العمل، نطاق صلاحيات العامل، تعدد عضويات البقالة، سياسة إقفال الفترة، وبيانات الجمعة. المخطط يتجنب SQL التنفيذ حتى موافقة التخطيط.
