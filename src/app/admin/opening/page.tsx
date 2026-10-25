import { Card } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/status";
import { OpeningBalanceForm } from "@/features/operations/opening-balance-form";
import { businessDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatAmount, formatDate } from "@/lib/format";
import type { OpeningBalanceRow, StoreRow, SupplierRow } from "@/lib/supabase/types";

export const metadata = { title: "الأرصدة الافتتاحية" };

export default async function OpeningBalancesPage() {
  const client = await createServerSupabase();
  const [storesResult, suppliersResult, openingResult] = await Promise.all([
    client.from("stores").select("id,code,name,sort_order,active,created_at,updated_at").eq("active", true).order("sort_order"),
    client.from("suppliers").select("id,code,name,active,notes,created_at,updated_at").eq("active", true).order("name"),
    client.from("opening_balances").select("id,party_type,store_id,supplier_id,cutoff_date,amount,currency_code,direction,reason,status,journal_entry_id,idempotency_key,created_by,approved_by,created_at,posted_at").order("cutoff_date", { ascending: false }).limit(100),
  ]);
  if (storesResult.error || suppliersResult.error || openingResult.error) return <Alert title="تعذر تحميل الأرصدة">تحقق من migrations وصلاحية المدير.</Alert>;
  const stores = (storesResult.data ?? []) as StoreRow[];
  const suppliers = (suppliersResult.data ?? []) as SupplierRow[];
  const rows = (openingResult.data ?? []) as OpeningBalanceRow[];
  const storeNames = new Map(stores.map((store) => [store.id, `${store.code} · ${store.name}`]));
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

  return <div className="space-y-4"><header><h1 className="text-xl font-bold text-brand-900">الأرصدة الافتتاحية</h1><p className="text-sm text-slate-600">إدخال أولي موثق يرحّل إلى دفتر الأستاذ ولا يعدل لاحقًا.</p></header><Card title="إضافة رصيد افتتاحي"><OpeningBalanceForm stores={stores} suppliers={suppliers} date={businessDate()} /></Card><Card title="السجل">{rows.length === 0 ? <p className="text-center text-sm text-slate-500">لا توجد أرصدة افتتاحية.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="border-b border-border-subtle bg-surface"><tr><th className="px-3 py-2 text-start">تاريخ القطع</th><th className="px-3 py-2 text-start">الطرف</th><th className="px-3 py-2 text-start">المبلغ</th><th className="px-3 py-2 text-start">السبب</th><th className="px-3 py-2 text-start">الحالة</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-border-subtle"><td className="px-3 py-2">{formatDate(row.cutoff_date)}</td><td className="px-3 py-2">{row.party_type === "store" ? storeNames.get(row.store_id ?? "") : supplierNames.get(row.supplier_id ?? "")}</td><td className="num px-3 py-2">{formatAmount(row.amount)}</td><td className="px-3 py-2">{row.reason}</td><td className="px-3 py-2">{row.status}</td></tr>)}</tbody></table></div>}</Card></div>;
}