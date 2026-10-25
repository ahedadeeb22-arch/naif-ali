import Link from "next/link";
import { Card, StatCard } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/status";
import { businessDate, isIsoDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { callRpc } from "@/lib/rpc";
import { formatAmount, formatDate, formatQuantity } from "@/lib/format";
import { CloseSheetButton } from "@/features/operations/close-sheet-button";
import type { StatementData } from "@/features/operations/statement-view";
import type { StoreRow, SupplierRow } from "@/lib/supabase/types";
import { Printer, Receipt, Truck, Store as StoreIcon } from "lucide-react";

export const metadata = { title: "لوحة المدير — كشوفات البقالات والموردين" };

interface DashboardSummary {
  date: string;
  purchase_today: number | string;
  supplier_due: number | string;
  store_due: number | string;
  inventory_balance: number | string;
  damage_expense: number | string;
  sheet: { id: string; status: string; version: number; business_date: string; revision_no: number } | null;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    supplier?: string;
    store?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const date = businessDate();
  const from = params.from && isIsoDate(params.from) ? params.from : date;
  const to = params.to && isIsoDate(params.to) ? params.to : date;
  const client = await createServerSupabase();

  let summary: DashboardSummary;
  try {
    summary = await callRpc<DashboardSummary>(client, "dashboard_summary", { p_date: date });
  } catch {
    return (
      <Alert title="تعذر تحميل لوحة المدير">
        تحقق من تطبيق migrations وصلاحية حساب المدير ثم أعد تحميل الصفحة.
      </Alert>
    );
  }

  // جلب قائمة الموردين والبقالات للكشوفات التفصيلية
  const [suppliersRes, storesRes] = await Promise.all([
    client.from("suppliers").select("id, code, name").order("name"),
    client.from("stores").select("id, code, name").order("sort_order"),
  ]);

  const suppliers = (suppliersRes.data ?? []) as SupplierRow[];
  const stores = (storesRes.data ?? []) as StoreRow[];

  const selectedSupplierId = params.supplier ?? suppliers[0]?.id;
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

  const selectedStoreId = params.store ?? stores[0]?.id;
  const selectedStore = stores.find((s) => s.id === selectedStoreId) || stores[0];

  // جلب كشف حساب المورد المحدد إن وجد
  let supplierStatement: StatementData | null = null;
  if (selectedSupplier) {
    try {
      supplierStatement = await callRpc<StatementData>(client, "supplier_statement", {
        p_supplier_id: selectedSupplier.id,
        p_from: from,
        p_to: to,
      });
    } catch {
      // ignore fallback
    }
  }

  // جلب كشف حساب البقالة المحددة إن وُجدت
  let storeStatement: StatementData | null = null;
  if (selectedStore) {
    try {
      storeStatement = await callRpc<StatementData>(client, "store_statement", {
        p_store_id: selectedStore.id,
        p_from: from,
        p_to: to,
      });
    } catch {
      // ignore fallback
    }
  }

  return (
    <div className="space-y-6">
      {/* البطاقات الإحصائية العلوية الأربعة (مطابقة لملف الـ HTML) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* مشتريات اليوم */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm border-r-6 border-r-emerald-600">
          <div className="text-xs text-slate-500 font-semibold mb-1">إجمالي مشتريات اليوم ({date})</div>
          <div className="num text-2xl font-black text-emerald-700">
            {formatAmount(summary.purchase_today)}
          </div>
        </div>

        {/* ديون الموردين */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm border-r-6 border-r-[#e58e26]">
          <div className="text-xs text-slate-500 font-semibold mb-1">إجمالي الديون التي علينا للموردين</div>
          <div className="num text-2xl font-black text-[#e58e26]">
            {formatAmount(summary.supplier_due)}
          </div>
        </div>

        {/* ديون البقالات */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm border-r-6 border-r-[#0652DD]">
          <div className="text-xs text-slate-500 font-semibold mb-1">إجمالي الديون المطلوبة من البقالات</div>
          <div className="num text-2xl font-black text-[#0652DD]">
            {formatAmount(summary.store_due)}
          </div>
        </div>

        {/* حالة اليومية وزر الإغلاق والاعتماد */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm border-r-6 border-r-[#EA2027] flex flex-col justify-between">
          <div>
            <div className="text-xs text-slate-500 font-semibold mb-1">حالة كشف اليومية الحالي</div>
            <div className="text-sm font-black text-slate-900">
              {summary.sheet ? (
                <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-800">
                  {summary.sheet.status === "posted"
                    ? "معتمدة ومرحلة"
                    : summary.sheet.status === "closed"
                    ? "مغلقة"
                    : summary.sheet.status}
                </span>
              ) : (
                <span className="text-xs text-slate-400">لا توجد يومية مفتوحة</span>
              )}
            </div>
          </div>
          {summary.sheet && summary.sheet.status === "posted" && (
            <div className="mt-2">
              <CloseSheetButton sheetId={summary.sheet.id} version={summary.sheet.version} />
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* أولاً: شاشة كشف حساب مورد مفصل (مطابقة لملف الـ HTML) */}
      {/* ======================================================== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 border-t-5 border-t-[#e58e26]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-[#e58e26] font-bold text-sm">
              <Truck size={18} />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-900">
                🚚 أولاً: شاشة كشف حساب مورد مفصل (تحديد بالتاريخ)
              </h2>
              <p className="text-xs text-slate-500">
                متابعة المشتريات بالآجل من المورد وسندات السداد النقدية والرصيد المتبقي له.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedSupplier && (
              <Link
                href={`/admin/vouchers?type=payment_to_supplier&party=${selectedSupplier.id}`}
                className="flex items-center gap-1.5 rounded-xl bg-[#e58e26] hover:bg-[#d07e1c] text-white px-3.5 py-2 text-xs font-black shadow-xs transition-all"
              >
                <Receipt size={14} />
                <span>💵 + تسجيل سند سداد للمورد</span>
              </Link>
            )}
            <Link
              href={`/reports/pdf/supplier-statement?supplier=${selectedSupplier?.id || ""}&from=${from}&to=${to}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-xs font-bold shadow-xs transition-all"
            >
              <Printer size={14} />
              <span>🖨️ طباعة / PDF</span>
            </Link>
          </div>
        </div>

        {/* شريط الفلترة */}
        <form className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3 text-xs" action="" method="get">
          <label className="font-bold text-slate-700">
            اختر المورد:
            <select
              name="supplier"
              defaultValue={selectedSupplier?.id || ""}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="font-bold text-slate-700">
            من تاريخ:
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold"
            >
            </input>
          </label>

          <label className="font-bold text-slate-700">
            إلى تاريخ:
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold"
            >
            </input>
          </label>

          <button
            type="submit"
            className="rounded-lg bg-brand-900 hover:bg-brand-800 px-3.5 py-1.5 text-xs font-bold text-white transition-all shadow-xs"
          >
            🔍 عرض الكشف
          </button>
        </form>

        {/* جدول حركات المورد */}
        {supplierStatement && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[750px] border-collapse text-xs">
              <thead className="bg-[#b33939] text-white font-bold border-b border-[#8a2525]">
                <tr>
                  <th className="p-2.5 text-center min-w-24">التاريخ</th>
                  <th className="p-2.5 text-start min-w-36 border-l border-white/20">البيان / العملية</th>
                  <th className="p-2.5 text-start min-w-48 border-l border-white/20">تفاصيل الأصناف المأخوذة</th>
                  <th className="p-2.5 text-center min-w-28 border-l border-white/20">قيمة المشتريات (بالآجل)</th>
                  <th className="p-2.5 text-center min-w-28 border-l border-white/20">المسدد للمورد</th>
                  <th className="p-2.5 text-center min-w-28 border-l border-white/20">الرصيد المتبقي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {supplierStatement.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      لا توجد حركات مسجلة لهذا المورد خلال هذه الفترة.
                    </td>
                  </tr>
                ) : (
                  supplierStatement.rows.map((r, i) => (
                    <tr
                      key={i}
                      className={
                        r.kind.includes("voucher") || r.kind.includes("payment")
                          ? "bg-emerald-50/60 font-bold"
                          : i % 2 === 0
                          ? "bg-white"
                          : "bg-slate-50/50"
                      }
                    >
                      <td className="num p-2.5 text-center font-bold text-slate-800">{formatDate(r.date)}</td>
                      <td className="p-2.5 text-slate-800 font-semibold border-l border-slate-100">{r.description || r.kind}</td>
                      <td className="p-2.5 text-slate-700 text-[11px] border-l border-slate-100">
                        {r.product_name ? `${r.product_name} (${formatQuantity(r.quantity)} سلة)` : "—"}
                      </td>
                      <td className="num p-2.5 text-center font-black text-slate-900 border-l border-slate-100">
                        {Number(r.credit) > 0 ? formatAmount(r.credit) : "—"}
                      </td>
                      <td className="num p-2.5 text-center font-black text-emerald-700 border-l border-slate-100">
                        {Number(r.debit) > 0 ? formatAmount(r.debit) : "—"}
                      </td>
                      <td className="num p-2.5 text-center font-black text-slate-900 border-l border-slate-100">
                        {formatAmount(r.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-[#ffeaa7] text-slate-900 font-bold border-t-2 border-[#fdcb6e]">
                <tr>
                  <td colSpan={3} className="p-2.5 text-start font-black text-xs">
                    الإجمالي لحساب المورد ({selectedSupplier?.name}) خلال الفترة
                  </td>
                  <td className="num p-2.5 text-center font-black text-xs border-l border-[#fdcb6e]">
                    {formatAmount(supplierStatement.total_charges)}
                  </td>
                  <td className="num p-2.5 text-center font-black text-xs text-emerald-800 border-l border-[#fdcb6e]">
                    {formatAmount(supplierStatement.total_paid)}
                  </td>
                  <td className="num p-2.5 text-center font-black text-xs text-[#EA2027] border-l border-[#fdcb6e]">
                    المتبقي له: {formatAmount(supplierStatement.closing_balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ======================================================== */}
      {/* ثانياً: شاشة كشف حساب بقالة مفصل (مطابقة لملف الـ HTML) */}
      {/* ======================================================== */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 border-t-5 border-t-[#0652DD]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#0652DD] font-bold text-sm">
              <StoreIcon size={18} />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-900">
                🏪 ثانياً: شاشة كشف حساب بقالة مفصل (تحديد بالتاريخ)
              </h2>
              <p className="text-xs text-slate-500">
                متابعة الخضروات المسلمة للبقالة، وسندات القبض المسددة منها، والمتبقي عليها.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedStore && (
              <Link
                href={`/admin/vouchers?type=receipt_from_store&party=${selectedStore.id}`}
                className="flex items-center gap-1.5 rounded-xl bg-[#0652DD] hover:bg-[#0542b3] text-white px-3.5 py-2 text-xs font-black shadow-xs transition-all"
              >
                <Receipt size={14} />
                <span>💰 + تسجيل دفعة مستلمة من البقالة</span>
              </Link>
            )}
            <Link
              href={`/reports/pdf/store-statement?store=${selectedStore?.id || ""}&from=${from}&to=${to}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-xs font-bold shadow-xs transition-all"
            >
              <Printer size={14} />
              <span>🖨️ طباعة / PDF</span>
            </Link>
          </div>
        </div>

        {/* شريط الفلترة */}
        <form className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3 text-xs" action="" method="get">
          <label className="font-bold text-slate-700">
            اختر البقالة:
            <select
              name="store"
              defaultValue={selectedStore?.id || ""}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  البقالة ({s.code}) - {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="font-bold text-slate-700">
            من تاريخ:
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold"
            >
            </input>
          </label>

          <label className="font-bold text-slate-700">
            إلى تاريخ:
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold"
            >
            </input>
          </label>

          <button
            type="submit"
            className="rounded-lg bg-brand-900 hover:bg-brand-800 px-3.5 py-1.5 text-xs font-bold text-white transition-all shadow-xs"
          >
            🔍 عرض الكشف
          </button>
        </form>

        {/* جدول حركات البقالة */}
        {storeStatement && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[750px] border-collapse text-xs">
              <thead className="bg-[#0652DD] text-white font-bold border-b border-[#0542b3]">
                <tr>
                  <th className="p-2.5 text-center min-w-24">التاريخ</th>
                  <th className="p-2.5 text-start min-w-36 border-l border-white/20">العملية / البيان</th>
                  <th className="p-2.5 text-start min-w-48 border-l border-white/20">تفاصيل الخضروات المسلمة</th>
                  <th className="p-2.5 text-center min-w-28 border-l border-white/20">إجمالي اليوم</th>
                  <th className="p-2.5 text-center min-w-28 border-l border-white/20">المسدد للإدارة</th>
                  <th className="p-2.5 text-center min-w-28 border-l border-white/20">المتبقي على البقالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {storeStatement.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      لا توجد حركات مسجلة لهذه البقالة خلال هذه الفترة.
                    </td>
                  </tr>
                ) : (
                  storeStatement.rows.map((r, i) => (
                    <tr
                      key={i}
                      className={
                        r.kind.includes("voucher") || r.kind.includes("receipt")
                          ? "bg-emerald-50/60 font-bold"
                          : i % 2 === 0
                          ? "bg-white"
                          : "bg-slate-50/50"
                      }
                    >
                      <td className="num p-2.5 text-center font-bold text-slate-800">{formatDate(r.date)}</td>
                      <td className="p-2.5 text-slate-800 font-semibold border-l border-slate-100">{r.description || r.kind}</td>
                      <td className="p-2.5 text-slate-700 text-[11px] border-l border-slate-100">
                        {r.product_name ? `${r.product_name} (${formatQuantity(r.quantity)} سلة)` : "—"}
                      </td>
                      <td className="num p-2.5 text-center font-black text-slate-900 border-l border-slate-100">
                        {Number(r.debit) > 0 ? formatAmount(r.debit) : "—"}
                      </td>
                      <td className="num p-2.5 text-center font-black text-emerald-700 border-l border-slate-100">
                        {Number(r.credit) > 0 ? formatAmount(r.credit) : "—"}
                      </td>
                      <td className="num p-2.5 text-center font-black text-slate-900 border-l border-slate-100">
                        {formatAmount(r.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-[#ffeaa7] text-slate-900 font-bold border-t-2 border-[#fdcb6e]">
                <tr>
                  <td colSpan={3} className="p-2.5 text-start font-black text-xs">
                    الإجمالي لكشف حساب البقالة ({selectedStore?.name})
                  </td>
                  <td className="num p-2.5 text-center font-black text-xs border-l border-[#fdcb6e]">
                    {formatAmount(storeStatement.total_charges)}
                  </td>
                  <td className="num p-2.5 text-center font-black text-xs text-emerald-800 border-l border-[#fdcb6e]">
                    {formatAmount(storeStatement.total_paid)}
                  </td>
                  <td className="num p-2.5 text-center font-black text-xs text-[#0652DD] border-l border-[#fdcb6e]">
                    المطلوب منها: {formatAmount(storeStatement.closing_balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}