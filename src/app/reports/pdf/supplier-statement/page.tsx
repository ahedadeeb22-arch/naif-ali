import { PdfDocumentLayout } from "@/components/pdf/pdf-document-layout";
import { formatAmount, formatDate, formatQuantity } from "@/lib/format";
import { businessDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { callRpc } from "@/lib/rpc";
import type { StatementData } from "@/features/operations/statement-view";
import type { SupplierRow } from "@/lib/supabase/types";

export const metadata = { title: "كشف حساب المورد PDF" };

export default async function SupplierStatementPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = businessDate();
  const from = params.from || today;
  const to = params.to || today;
  const client = await createServerSupabase();

  const { data: supData } = await client.from("suppliers").select("*").order("name");
  const suppliers = (supData ?? []) as SupplierRow[];
  const supplierId = params.supplier || suppliers[0]?.id;
  const supplier = suppliers.find((s) => s.id === supplierId);

  if (!supplier) {
    return (
      <PdfDocumentLayout title="كشف حساب مورد" backHref="/admin/statements/suppliers">
        <div className="p-8 text-center text-sm text-slate-500">لم يتم العثور على المورد المطلوب.</div>
      </PdfDocumentLayout>
    );
  }

  let statement: StatementData | null = null;
  try {
    statement = await callRpc<StatementData>(client, "supplier_statement", {
      p_supplier_id: supplier.id,
      p_from: from,
      p_to: to,
    });
  } catch {
    // خطأ جلب الكشف
  }

  return (
    <PdfDocumentLayout
      title={`كشف حساب المورد: ${supplier.name}`}
      subtitle={`عن الفترة من ${formatDate(from)} إلى ${formatDate(to)}`}
      dateStr={formatDate(today)}
      documentNo={`SUP-${supplier.id.slice(0, 8).toUpperCase()}`}
      landscape={false}
      backHref={`/admin/statements/suppliers?supplier=${supplier.id}&from=${from}&to=${to}`}
      backLabel="كشوف الموردين"
    >
      {!statement ? (
        <div className="p-8 text-center text-sm text-slate-500">تعذر تحميل بيانات الكشف للفترة المحددة.</div>
      ) : (
        <div className="space-y-6 text-xs">
          {/* البطاقات المالية الأربع */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
            <div>
              <div className="text-slate-500 text-[11px]">رصيد أول المدة</div>
              <div className="num font-bold text-slate-900 text-sm">{formatAmount(statement.opening_balance)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[11px]">إجمالي المشتريات المستحقة</div>
              <div className="num font-bold text-rose-700 text-sm">
                {formatAmount(statement.total_purchases ?? statement.total_charges)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-[11px]">إجمالي المسدد له</div>
              <div className="num font-bold text-green-700 text-sm">{formatAmount(statement.total_paid)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[11px]">الرصيد المتبقي له</div>
              <div className="num font-black text-brand-900 text-base">{formatAmount(statement.closing_balance)}</div>
            </div>
          </div>

          {/* جدول الحركات */}
          <div>
            <h2 className="mb-2 text-xs font-bold text-brand-900">سجل حركات الفواتير والسداد التفصيلي</h2>
            <table className="w-full border-collapse border border-slate-300">
              <thead className="bg-slate-100 font-bold text-slate-800 text-[11px]">
                <tr>
                  <th className="border border-slate-300 p-2 text-center w-8">م</th>
                  <th className="border border-slate-300 p-2 text-start">التاريخ</th>
                  <th className="border border-slate-300 p-2 text-center">رقم القيد</th>
                  <th className="border border-slate-300 p-2 text-start">البيان</th>
                  <th className="border border-slate-300 p-2 text-start">الصنف</th>
                  <th className="border border-slate-300 p-2 text-center">الكمية</th>
                  <th className="border border-slate-300 p-2 text-center">سعر السلة</th>
                  <th className="border border-slate-300 p-2 text-center">مشتريات (له)</th>
                  <th className="border border-slate-300 p-2 text-center">سداد (منه)</th>
                  <th className="border border-slate-300 p-2 text-center">الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {statement.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-slate-400">
                      لا توجد حركات مسجلة خلال هذه الفترة
                    </td>
                  </tr>
                ) : (
                  statement.rows.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="num border border-slate-300 p-1.5 text-center text-slate-400">{idx + 1}</td>
                      <td className="num border border-slate-300 p-1.5 text-slate-700">{formatDate(row.date)}</td>
                      <td className="num border border-slate-300 p-1.5 text-center text-slate-500">
                        {row.entry_no ?? "—"}
                      </td>
                      <td className="border border-slate-300 p-1.5 font-medium text-slate-800">
                        {row.description || row.kind}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-slate-800">{row.product_name || "—"}</td>
                      <td className="num border border-slate-300 p-1.5 text-center">
                        {formatQuantity(row.quantity)}
                      </td>
                      <td className="num border border-slate-300 p-1.5 text-center">
                        {row.unit_price ? formatAmount(row.unit_price) : "—"}
                      </td>
                      <td className="num border border-slate-300 p-1.5 text-center font-bold text-rose-700">
                        {formatAmount(row.credit)}
                      </td>
                      <td className="num border border-slate-300 p-1.5 text-center font-bold text-green-700">
                        {formatAmount(row.debit)}
                      </td>
                      <td className="num border border-slate-300 p-1.5 text-center font-black text-brand-900">
                        {formatAmount(row.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PdfDocumentLayout>
  );
}
