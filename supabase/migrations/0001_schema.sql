-- ============================================================================
-- 0001_schema.sql — الهيكل الأساسي
-- نظام محاسبي لمشتريات وتوزيع الخضروات.
-- القرارات المرتبطة: DECISIONS.md (D-01..D-13, I-01..I-20)
-- ============================================================================
-- ملاحظات:
--  * كل المبالغ numeric(14,2)، الكميات numeric(12,3).
--  * الجداول المالية immutable بعد النشر (تُنَفَّذ عبر RPC فقط).
--  * RLS في 0002_rls.sql، والإجراءات المالية في 0003_rpc.sql.
--  * لا أسرار ولا بيانات إنتاج في الملف.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- enums (نطاق محدود، لا يُستخدم كمصدر عرض؛ القيم النصية فقط)
-- ---------------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin', 'worker', 'store_owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sheet_status as enum ('draft', 'ready_for_review', 'posted', 'closed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type revision_status as enum ('draft', 'ready_for_review', 'posted', 'superseded', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type purchase_status as enum ('purchased', 'cancelled', 'free_sample');
exception when duplicate_object then null; end $$;

do $$ begin
  create type disposition_type as enum ('store_distribution', 'inventory_remaining', 'damaged', 'supplier_free_quantity', 'other_approved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type entry_kind as enum ('opening', 'purchase', 'inventory_credit', 'store_charge', 'supplier_payment', 'store_receipt', 'reversal', 'adjustment', 'inventory', 'damage', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type party_type as enum ('store', 'supplier');
exception when duplicate_object then null; end $$;

do $$ begin
  create type voucher_type as enum ('receipt_from_store', 'payment_to_supplier');
exception when duplicate_object then null; end $$;

do $$ begin
  create type voucher_status as enum ('draft', 'posted', 'reversed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type opening_status as enum ('draft', 'posted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type night_order_status as enum ('draft', 'submitted', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type opening_direction as enum ('debit', 'credit');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- هوية ومستخدمون
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  code text unique,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  role app_role not null default 'worker',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.role is 'الدور الموثوق — لا يُستمد من auth metadata.';

create table if not exists public.permissions (
  code text primary key,
  description text not null
);

create table if not exists public.role_permissions (
  role app_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role, permission_code)
);

-- أذونات إضافية للعامل؛ لا تُمنح لصاحب البقالة (RLS + check في RPC)
create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  allowed boolean not null default true,
  granted_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_code)
);

-- ---------------------------------------------------------------------------
-- كتالوج (البقالات، الموردون، الأصناف)
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null check (length(trim(code)) between 1 and 8),
  name text not null check (length(trim(name)) between 1 and 120),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists stores_code_uq on public.stores (code);
create unique index if not exists stores_name_uq on public.stores (name);

create table if not exists public.store_memberships (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(user_id),
  primary key (user_id, store_id)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null check (length(trim(name)) between 1 and 120),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists suppliers_name_uq on public.suppliers (name);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null check (length(trim(name)) between 1 and 120),
  unit_name text not null default 'سلة' check (length(trim(unit_name)) between 1 and 40),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists products_name_uq on public.products (name);

-- ---------------------------------------------------------------------------
-- دليل الحسابات (I-01) — ثابت في المرحلة الحالية
-- ---------------------------------------------------------------------------
create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type account_type not null,
  active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- طلبات الليل (D-03) — لا أثر مالي
-- ---------------------------------------------------------------------------
create table if not exists public.night_orders (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  store_id uuid not null references public.stores(id) on delete restrict,
  status night_order_status not null default 'draft',
  version int not null default 1,
  created_by uuid not null references public.profiles(user_id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_date, store_id)   -- I-06
);

create table if not exists public.night_order_lines (
  id uuid primary key default gen_random_uuid(),
  night_order_id uuid not null references public.night_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (night_order_id, product_id)
);

-- ---------------------------------------------------------------------------
-- اليومية والإصدارات (D-11, I-07)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_sheets (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  status sheet_status not null default 'draft',
  current_revision_id uuid,
  version int not null default 1,
  created_by uuid not null references public.profiles(user_id),
  submitted_by uuid references public.profiles(user_id),
  posted_by uuid references public.profiles(user_id),
  closed_by uuid references public.profiles(user_id),
  posted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists daily_sheets_date_status_idx on public.daily_sheets (business_date desc, status);

create table if not exists public.daily_sheet_revisions (
  id uuid primary key default gen_random_uuid(),
  daily_sheet_id uuid not null references public.daily_sheets(id) on delete restrict,
  revision_no int not null check (revision_no > 0),
  based_on_revision_id uuid references public.daily_sheet_revisions(id) on delete restrict,
  status revision_status not null default 'draft',
  revision_kind text not null default 'original' check (revision_kind in ('original', 'correction')),
  reason text,
  business_date_snapshot date not null,
  content_hash text,
  total_purchase_value numeric(14,2) not null default 0 check (total_purchase_value >= 0),
  total_distributed_value numeric(14,2) not null default 0 check (total_distributed_value >= 0),
  total_inventory_value numeric(14,2) not null default 0 check (total_inventory_value >= 0),
  total_damaged_value numeric(14,2) not null default 0 check (total_damaged_value >= 0),
  version int not null default 1,
  created_by uuid not null references public.profiles(user_id),
  reviewed_by uuid references public.profiles(user_id),
  posted_by uuid references public.profiles(user_id),
  posted_at timestamptz,
  superseded_by_revision_id uuid references public.daily_sheet_revisions(id),
  reverses_revision_id uuid references public.daily_sheet_revisions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_sheet_id, revision_no),
  check (revision_kind = 'original' or reason is not null)
);
create index if not exists revisions_sheet_idx on public.daily_sheet_revisions (daily_sheet_id, revision_no desc);
create index if not exists revisions_status_idx on public.daily_sheet_revisions (status);

alter table public.daily_sheets
  drop constraint if exists daily_sheets_current_revision_fk;
alter table public.daily_sheets
  add constraint daily_sheets_current_revision_fk
  foreign key (current_revision_id) references public.daily_sheet_revisions(id);

create table if not exists public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.daily_sheet_revisions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  purchase_status purchase_status not null default 'purchased',
  purchased_quantity numeric(12,3) not null default 0 check (purchased_quantity >= 0),
  basket_unit_price numeric(14,2) check (basket_unit_price is null or basket_unit_price >= 0),
  currency_code char(3) not null default 'SAR',
  note text,
  cancellation_reason text,
  free_reason text,
  line_no int not null default 1,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- I-13 / I-03 / SPEC §5
  constraint purchase_cancelled_has_reason check (
    purchase_status <> 'cancelled' or (cancellation_reason is not null and length(trim(cancellation_reason)) > 0)
  ),
  constraint purchase_free_has_reason_and_zero_price check (
    purchase_status <> 'free_sample'
    or (free_reason is not null and length(trim(free_reason)) > 0 and basket_unit_price = 0)
  ),
  constraint purchase_purchased_has_supplier_and_price check (
    purchase_status <> 'purchased'
    or (supplier_id is not null and basket_unit_price is not null)
  ),
  constraint purchase_cancelled_no_value check (
    purchase_status <> 'cancelled' or (basket_unit_price is null or basket_unit_price = 0)
  )
);
create index if not exists purchase_lines_revision_idx on public.purchase_lines (revision_id, line_no);
create index if not exists purchase_lines_product_idx on public.purchase_lines (product_id);
create index if not exists purchase_lines_supplier_idx on public.purchase_lines (supplier_id);

create table if not exists public.purchase_dispositions (
  id uuid primary key default gen_random_uuid(),
  purchase_line_id uuid not null references public.purchase_lines(id) on delete cascade,
  disposition_type disposition_type not null,
  store_id uuid references public.stores(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  reason text,
  approved_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  constraint disposition_store_required check (
    disposition_type <> 'store_distribution' or store_id is not null
  ),
  constraint disposition_store_forbidden check (
    disposition_type = 'store_distribution' or store_id is null
  ),
  constraint disposition_reason_required check (
    disposition_type not in ('damaged', 'other_approved') or (reason is not null and length(trim(reason)) > 0)
  )
);
create index if not exists dispositions_line_idx on public.purchase_dispositions (purchase_line_id);
create index if not exists dispositions_store_idx on public.purchase_dispositions (store_id);

create table if not exists public.daily_sheet_events (
  id uuid primary key default gen_random_uuid(),
  daily_sheet_id uuid not null references public.daily_sheets(id) on delete restrict,
  revision_id uuid references public.daily_sheet_revisions(id),
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles(user_id),
  reason text,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists sheet_events_idx on public.daily_sheet_events (daily_sheet_id, created_at);

-- ---------------------------------------------------------------------------
-- دفتر الأستاذ (D-02, I-01, I-04)
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no bigserial unique,
  source_type text not null,
  source_id uuid not null,
  source_revision_id uuid references public.daily_sheet_revisions(id),
  entry_kind entry_kind not null,
  effective_date date not null,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  reversal_of_id uuid references public.journal_entries(id),
  idempotency_key text not null unique,
  posted_by uuid references public.profiles(user_id),
  posted_at timestamptz not null default now(),
  description text,
  created_at timestamptz not null default now(),
  -- D-06 / I-08: لا تكرار لنفس المصدر/الإصدار/النوع إلا للقيود التي تفردها مراجعها الخاصة.
  constraint journal_source_revision_kind_uq unique (source_type, source_id, source_revision_id, entry_kind)
);
create index if not exists journal_entries_date_idx on public.journal_entries (effective_date);
create index if not exists journal_entries_source_idx on public.journal_entries (source_type, source_id);

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  store_id uuid references public.stores(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  purchase_line_id uuid references public.purchase_lines(id),
  revision_id uuid references public.daily_sheet_revisions(id),
  description text,
  created_at timestamptz not null default now(),
  constraint journal_line_one_side check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);
create index if not exists journal_lines_entry_idx on public.journal_lines (journal_entry_id);
create index if not exists journal_lines_store_idx on public.journal_lines (store_id, account_id);
create index if not exists journal_lines_supplier_idx on public.journal_lines (supplier_id, account_id);
create index if not exists journal_lines_account_date_idx on public.journal_lines (account_id, journal_entry_id);
create index if not exists journal_lines_revision_idx on public.journal_lines (revision_id);

-- ---------------------------------------------------------------------------
-- الأرصدة الافتتاحية (I-02)
-- ---------------------------------------------------------------------------
create table if not exists public.opening_balances (
  id uuid primary key default gen_random_uuid(),
  party_type party_type not null,
  store_id uuid references public.stores(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  cutoff_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  currency_code char(3) not null default 'SAR',
  direction opening_direction not null default 'debit',
  reason text not null,
  status opening_status not null default 'draft',
  journal_entry_id uuid unique references public.journal_entries(id),
  idempotency_key text not null unique,
  created_by uuid not null references public.profiles(user_id),
  approved_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  constraint opening_party_check check (
    (party_type = 'store' and store_id is not null and supplier_id is null)
    or (party_type = 'supplier' and supplier_id is not null and store_id is null)
  )
);
create index if not exists opening_party_idx on public.opening_balances (store_id, supplier_id);

-- ---------------------------------------------------------------------------
-- السندات (SPEC §9, I-09)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text not null unique,
  voucher_type voucher_type not null,
  store_id uuid references public.stores(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency_code char(3) not null default 'SAR',
  effective_date date not null,
  method text,
  reference_no text,
  memo text,
  status voucher_status not null default 'draft',
  journal_entry_id uuid unique references public.journal_entries(id),
  idempotency_key text not null unique,
  created_by uuid not null references public.profiles(user_id),
  approved_by uuid references public.profiles(user_id),
  posted_at timestamptz,
  reversal_voucher_id uuid references public.payment_vouchers(id),
  created_at timestamptz not null default now(),
  constraint voucher_party_check check (
    (voucher_type = 'receipt_from_store' and store_id is not null and supplier_id is null)
    or (voucher_type = 'payment_to_supplier' and supplier_id is not null and store_id is null)
  )
);
create index if not exists vouchers_store_idx on public.payment_vouchers (store_id, effective_date);
create index if not exists vouchers_supplier_idx on public.payment_vouchers (supplier_id, effective_date);

-- ---------------------------------------------------------------------------
-- التدقيق (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(user_id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  revision_id uuid,
  occurred_at timestamptz not null default now(),
  request_id text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb
);
create index if not exists audit_entity_idx on public.audit_log (entity_type, entity_id, occurred_at desc);
create index if not exists audit_actor_idx on public.audit_log (actor_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- تحديث updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','stores','suppliers','products','night_orders','daily_sheets','daily_sheet_revisions','purchase_lines']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- منع UPDATE/DELETE لقيود الأستاذ والتدقيق (طبقة schema — تُمنع أيضاً لـauthenticated)
-- ---------------------------------------------------------------------------
create or replace function public.prevent_immutable_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'السجلات المالية والتدقيق غير قابلة للتعديل أو الحذف (immutable)'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists journal_entries_immutable on public.journal_entries;
create trigger journal_entries_immutable before update or delete on public.journal_entries
  for each row execute function public.prevent_immutable_mutation();

drop trigger if exists journal_lines_immutable on public.journal_lines;
create trigger journal_lines_immutable before update or delete on public.journal_lines
  for each row execute function public.prevent_immutable_mutation();

drop trigger if exists audit_immutable on public.audit_log;
create trigger audit_immutable before update or delete on public.audit_log
  for each row execute function public.prevent_immutable_mutation();
