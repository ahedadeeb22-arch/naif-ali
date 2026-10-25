import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/status";
import { StatementView, type StatementData } from "@/features/operations/statement-view";
import { businessDate, isIsoDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { callRpc } from "@/lib/rpc";
import type { StoreRow } from "@/lib/supabase/types";
import { Printer, Receipt } from "lucide-react";

export const metadata = { title: "كشوف حسابات البقالات" };

export default async function StoreStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = businessDate();
  const from = params.from && isIsoDate(params.from) ? params.from : today;
  const to = params.to && isIsoDate(params.to) ? params.to : today;
  const client = await createServerSupabase();

  const { data, error } = await client
    .from("stores")
    .select("id, code, name, sort_order, active, created_at, updated_at")
    .order("sort_order");

  if (error) return <Alert title="تعذر تحميل البقالات">تحقق من صلاحية المدير واتصال قاعدة البيانات.</Alert>;
  const stores = (data ?? []) as StoreRow[];
  const storeId = params.store ?? stores[0]?.id;
  const store = stores.find((item) => item.id === storeId);

  if (!store) {
    return (
      <Card title="كشف البقالة">
        <p className="text-sm text-slate-600">لا توجد بقالات مسجلة في النظام.</p>
      </Card>
    );
  }

  let statement: StatementData;
  try {
    statement = await callRpc<StatementData>(client, "store_statement", {
      p_store_id: store.id,
      p_from: from,
      p_to: to,
    });
  } catch {
    return <Alert title="تعذر تحميل كشف البقالة">راجع الفترة وتأكد من تطبيق الدوال المحاسبية وصلاحية المدير.</Alert>;
  }

  return (
    <div className="space-y-4">
      {/* شريط الإجراءات والفلترة وزر السند والـ PDF */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-xl font-black text-brand-900">
            كشف حساب البقالة: {store.code} · {store.name}
          </h1>
          <p className="text-xs text-slate-600">
            متابعة المسحوبات المستلمة يومياً، والدفعات المسددة، والرصيد التراكمي المتبقي عليها.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* زر تسجيل دفعة مستلمة من البقالة */}
          <Link
            href={`/admin/vouchers?type=receipt_from_store&party=${store.id}`}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-800 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:opacity-95"
          >
            <Receipt size={15} />
            <span>تسجيل دفعة مستلمة من البقالة</span>
          </Link>

          {/* زر تصدير PDF */}
          <Link
            href={`/reports/pdf/store-statement?store=${store.id}&from=${from}&to=${to}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Printer size={15} />
            <span>تصدير PDF</span>
          </Link>
        </div>
      </header>

      {/* نموذج الفلترة */}
      <form className="flex flex-wrap items-end gap-2 bg-white p-3 rounded-xl border border-slate-200">
        <label className="text-xs font-semibold text-slate-700">
          البقالة:
          <select
            name="store"
            defaultValue={store.id}
            className="mt-1 block rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold"
          >
            {stores.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700">
          من:
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 block rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold"
          />
        </label>
        <label className="text-xs font-semibold text-slate-700">
          إلى:
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 block rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-900 px-4 py-2 text-xs font-bold text-white hover:bg-brand-800"
        >
          تحديث الكشف
        </button>
      </form>

      {/* جدول كشف الحساب التراكمي الموحد */}
      <StatementView
        statement={statement}
        partyName={`${store.code} · ${store.name}`}
        partyKind="store"
      />
    </div>
  );
}
