import { Card } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/status";
import { ReverseVoucherButton } from "@/features/operations/reverse-voucher-button";
import { VoucherForm } from "@/features/operations/voucher-form";
import { businessDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import type { PaymentVoucherRow, StoreRow, SupplierRow } from "@/lib/supabase/types";

export const metadata = { title: "سندات القبض والصرف" };

export default async function AdminVouchersPage() {
  const client = await createServerSupabase();
  const [storesResult, suppliersResult, vouchersResult] = await Promise.all([
    client.from("stores").select("id,code,name,sort_order,active,created_at,updated_at").eq("active", true).order("sort_order"),
    client.from("suppliers").select("id,code,name,active,notes,created_at,updated_at").eq("active", true).order("name"),
    client.from("payment_vouchers").select("id,voucher_no,voucher_type,store_id,supplier_id,amount,currency_code,effective_date,method,reference_no,memo,status,journal_entry_id,idempotency_key,created_by,approved_by,posted_at,reversal_voucher_id,created_at").order("effective_date", { ascending: false }).limit(100),
  ]);
  if (storesResult.error || suppliersResult.error || vouchersResult.error) return <Alert title="تعذر تحميل السندات">تحقق من migrations وصلاحية المدير.</Alert>;
  const stores = (storesResult.data ?? []) as StoreRow[];
  const suppliers = (suppliersResult.data ?? []) as SupplierRow[];
  const vouchers = (vouchersResult.data ?? []) as PaymentVoucherRow[];
  const storeNames = new Map(stores.map((store) => [store.id, `${store.code} · ${store.name}`]));
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

  return <div className="space-y-4"><header><h1 className="text-xl font-bold text-brand-900">سندات القبض والصرف</h1><p className="text-sm text-slate-600">كل سند يرحّل بقيد مستقل، وتصحيحه بعكس موثق لا بالحذف.</p></header><Card title="إنشاء سند"><VoucherForm stores={stores} suppliers={suppliers} date={businessDate()} /></Card><Card title="آخر السندات">{vouchers.length === 0 ? <p className="text-center text-sm text-slate-500">لا توجد سندات.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="border-b border-border-subtle bg-surface"><tr><th className="px-3 py-2 text-start">رقم السند</th><th className="px-3 py-2 text-start">التاريخ</th><th className="px-3 py-2 text-start">النوع والطرف</th><th className="px-3 py-2 text-start">المبلغ</th><th className="px-3 py-2 text-start">الحالة</th><th className="px-3 py-2 text-start">تاريخ الترحيل</th><th className="px-3 py-2 text-start">إجراء</th></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.id} className="border-b border-border-subtle"><td className="num px-3 py-2">{voucher.voucher_no}</td><td className="px-3 py-2">{formatDate(voucher.effective_date)}</td><td className="px-3 py-2">{voucher.voucher_type === "receipt_from_store" ? "قبض · " + (storeNames.get(voucher.store_id ?? "") ?? "بقالة") : "صرف · " + (supplierNames.get(voucher.supplier_id ?? "") ?? "مورد")}</td><td className="num px-3 py-2">{formatAmount(voucher.amount)}</td><td className="px-3 py-2">{voucher.status}</td><td className="px-3 py-2">{formatDateTime(voucher.posted_at)}</td><td className="px-3 py-2">{voucher.status === "posted" ? <ReverseVoucherButton voucherId={voucher.id} /> : "—"}</td></tr>)}</tbody></table></div>}</Card></div>;
}