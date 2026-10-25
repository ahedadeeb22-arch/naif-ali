/**
 * أنواع عملاء Supabase. المخطط المكتوب هنا يغطي الجداول التي يقرأها/يكتبها التطبيق
 * حاليًا. بعد ربط مشروع حقي يُفضّل توليد نسخة كاملة:
 *   supabase gen typescript --local > src/lib/supabase/types.ts
 * الملف لا يحتوي أسرارًا ولا اتصالًا.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "worker" | "store_owner";
export type SheetStatus = "draft" | "ready_for_review" | "posted" | "closed" | "cancelled";
export type RevisionStatus = "draft" | "ready_for_review" | "posted" | "superseded" | "cancelled";
export type PurchaseStatus = "purchased" | "cancelled" | "free_sample";
export type DispositionType =
  | "store_distribution"
  | "inventory_remaining"
  | "damaged"
  | "supplier_free_quantity"
  | "other_approved";
export type NightOrderStatus = "draft" | "submitted" | "cancelled";

export interface ProfileRow {
  user_id: string;
  code: string | null;
  display_name: string;
  role: AppRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreRow {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreMembershipRow {
  user_id: string;
  store_id: string;
  active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface SupplierRow {
  id: string;
  code: string | null;
  name: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  code: string | null;
  name: string;
  unit_name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NightOrderRow {
  id: string;
  business_date: string;
  store_id: string;
  status: NightOrderStatus;
  version: number;
  created_by: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NightOrderLineRow {
  id: string;
  night_order_id: string;
  product_id: string;
  quantity: string;
  note: string | null;
  created_at: string;
}

export interface DailySheetRow {
  id: string;
  business_date: string;
  status: SheetStatus;
  current_revision_id: string | null;
  version: number;
  created_by: string;
  submitted_by: string | null;
  posted_by: string | null;
  closed_by: string | null;
  posted_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailySheetRevisionRow {
  id: string;
  daily_sheet_id: string;
  revision_no: number;
  based_on_revision_id: string | null;
  status: RevisionStatus;
  revision_kind: "original" | "correction";
  reason: string | null;
  business_date_snapshot: string;
  content_hash: string | null;
  total_purchase_value: string;
  total_distributed_value: string;
  total_inventory_value: string;
  total_damaged_value: string;
  version: number;
  created_by: string;
  reviewed_by: string | null;
  posted_by: string | null;
  posted_at: string | null;
  superseded_by_revision_id: string | null;
  reverses_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseLineRow {
  id: string;
  revision_id: string;
  product_id: string;
  supplier_id: string | null;
  purchase_status: PurchaseStatus;
  purchased_quantity: string;
  basket_unit_price: string | null;
  currency_code: string;
  note: string | null;
  cancellation_reason: string | null;
  free_reason: string | null;
  line_no: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseDispositionRow {
  id: string;
  purchase_line_id: string;
  disposition_type: DispositionType;
  store_id: string | null;
  quantity: string;
  unit_cost: string;
  reason: string | null;
  approved_by: string | null;
  created_at: string;
}

export interface PaymentVoucherRow {
  id: string;
  voucher_no: string;
  voucher_type: "receipt_from_store" | "payment_to_supplier";
  store_id: string | null;
  supplier_id: string | null;
  amount: string;
  currency_code: string;
  effective_date: string;
  method: string | null;
  reference_no: string | null;
  memo: string | null;
  status: "draft" | "posted" | "reversed";
  journal_entry_id: string | null;
  idempotency_key: string;
  created_by: string;
  approved_by: string | null;
  posted_at: string | null;
  reversal_voucher_id: string | null;
  created_at: string;
}

export interface OpeningBalanceRow {
  id: string;
  party_type: "store" | "supplier";
  store_id: string | null;
  supplier_id: string | null;
  cutoff_date: string;
  amount: string;
  currency_code: string;
  direction: "debit" | "credit";
  reason: string;
  status: "draft" | "posted";
  journal_entry_id: string | null;
  idempotency_key: string;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  posted_at: string | null;
}

export interface AuditLogRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  revision_id: string | null;
  occurred_at: string;
  request_id: string | null;
  reason: string | null;
  before_data: Json | null;
  after_data: Json | null;
  metadata: Json | null;
}

type TableShape<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row> };

export interface Database {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow>;
      stores: TableShape<StoreRow>;
      store_memberships: TableShape<StoreMembershipRow>;
      suppliers: TableShape<SupplierRow>;
      products: TableShape<ProductRow>;
      night_orders: TableShape<NightOrderRow>;
      night_order_lines: TableShape<NightOrderLineRow>;
      daily_sheets: TableShape<DailySheetRow>;
      daily_sheet_revisions: TableShape<DailySheetRevisionRow>;
      purchase_lines: TableShape<PurchaseLineRow>;
      purchase_dispositions: TableShape<PurchaseDispositionRow>;
      payment_vouchers: TableShape<PaymentVoucherRow>;
      opening_balances: TableShape<OpeningBalanceRow>;
      audit_log: TableShape<AuditLogRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
}
