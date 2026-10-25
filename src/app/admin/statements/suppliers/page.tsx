import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/status";
import { StatementView, type StatementData } from "@/features/operations/statement-view";
import { businessDate, isIsoDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { callRpc } from "@/lib/rpc";
import type { SupplierRow } from "@/lib/supabase/types";
import { Printer, Receipt } from "lucide-react";

export const metadata = { title: "كشوف حسابات الموردين" };

export default async function SupplierStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = businessDate();
  const from = params.from && isIsoDate(params.from) ? params.from : today;
  const to = params.to && isIsoDate(params.to) ? params.to : today;
  const client = await createServerSupabase();

  const { data, error } = await client
    .from("suppliers")
    .select("id, code, name, active, notes, created_at, updated_at")
    .order("name");

  if (error) return <Alert title="تعذر تحميل الموردين">تحقق من صلاحية المدير واتصال قاعدة البيانات.</Alert>;
  const suppliers = (data ?? []) as SupplierRow[];
  const supplierId = params.supplier ?? suppliers[0]?.id;
  const supplier = suppliers.find((item) => item.id === supplierId);

  if (!supplier) {
    return (
      <Card title="كشف المورد">
        <p className="text-sm text-slate-600">لا يوجد موردون مسجلون في النظام.</p>
      </Card>
    );
  }

  let statement: StatementData;
  try {
    statement = await callRpc<StatementData>(client, "supplier_statement", {
      p_supplier_id: supplier.id,
      p_from: from,
      p_to: to,
    });
  } catch {
    return <Alert title="تعذر تحميل كشف المورد">راجع الفترة وتأكد من تطبيق الدوال المحاسبية وصلاحية المدير.</Alert>;
  }

  return (
    <div className="space-y-4">
      {/* شريط الإجراءات والفلترة وزر السند والـ PDF */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-xl font-black text-brand-900">كشف حساب المورد: {supplier.name}</h1>
          <p className="text-xs text-slate-600">
            متابعة الفواتير المشتراة، وسندات السداد المدفوعة، والرصيد التراكمي المستحق له.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* زر تسجيل سند سداد للمورد */}
          <Link
            href={`/admin/vouchers?type=payment_to_supplier&party=${supplier.id}`}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-800 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:opacity-95"
          >
            <Receipt size={15} />
            <span>تسجيل سند سداد للمورد</span>
          </Link>

          {/* زر تصدير PDF */}
          <Link
            href={`/reports/pdf/supplier-statement?supplier=${supplier.id}&from=${from}&to=${to}`}
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
          المورد:
          <select
            name="supplier"
            defaultValue={supplier.id}
            className="mt-1 block rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold"
          >
            {suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
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
        partyName={supplier.name}
        partyKind="supplier"
      />
    </div>
  );
}
