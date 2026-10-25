import { PdfDocumentLayout } from "@/components/pdf/pdf-document-layout";
import { formatAmount, formatDate, formatQuantity } from "@/lib/format";
import { businessDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadCatalog, loadSheetByDate } from "@/features/daily-sheets/data";
import { multiplyMoney, sumMoney } from "@/lib/money/decimal";

export const metadata = { title: "كشف مشتريات وتوزيع اليوم التفصيلي PDF" };

export default async function DailySheetPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || businessDate();
  const client = await createServerSupabase();

  const [sheet, catalog] = await Promise.all([
    loadSheetByDate(client, date),
    loadCatalog(client),
  ]);

  if (!sheet) {
    return (
      <PdfDocumentLayout
        title="كشف مشتريات وتوزيع اليوم"
        subtitle={`ليوم ${formatDate(date)}`}
        dateStr={formatDate(date)}
        backHref="/admin/sheets"
      >
        <div className="py-12 text-center text-sm text-slate-500">
          لا توجد بيانات مشتريات أو يومية مفتوحة لهذا التاريخ ({date}).
        </div>
      </PdfDocumentLayout>
    );
  }

  const { stores } = catalog;
  const purchasedLines = sheet.lines.filter((l) => l.purchase_status === "purchased");
  const unpurchasedLines = sheet.lines.filter((l) => l.purchase_status !== "purchased");

  // تجميع إجماليات كل بقالة
  const storeTotals: Record<string, { quantity: number; amount: string }> = {};
  for (const s of stores) {
    storeTotals[s.id] = { quantity: 0, amount: "0.00" };
  }

  for (const line of purchasedLines) {
    for (const disp of line.dispositions) {
      if (disp.store_id && storeTotals[disp.store_id]) {
        const q = Number(disp.quantity) || 0;
        storeTotals[disp.store_id]!.quantity += q;
        const linePrice = line.basket_unit_price || "0.00";
        const val = multiplyMoney(String(disp.quantity), linePrice);
        storeTotals[disp.store_id]!.amount = sumMoney([storeTotals[disp.store_id]!.amount, val]);
      }
    }
  }

  // الإجمالي العام للمشتريات
  const grandTotalAmount = sumMoney(
    purchasedLines.map((l) => multiplyMoney(l.purchased_quantity, l.basket_unit_price || "0.00")),
  );
  const grandTotalQty = purchasedLines.reduce((acc, l) => acc + Number(l.purchased_quantity || 0), 0);

  return (
    <PdfDocumentLayout
      title="كشف مشتريات وتوزيع اليوم التفصيلي"
      subtitle={`بيانات اليومية المعتمدة ليوم ${formatDate(date)}`}
      dateStr={formatDate(date)}
      documentNo={`SHEET-${sheet.sheet.id.slice(0, 8).toUpperCase()}`}
      landscape={true}
      backHref={`/admin/sheets?date=${date}`}
      backLabel="الكشف اليومي"
    >
      <div className="space-y-6 text-xs">
        {/* ملخص بطاقات الأرقام الكبرى */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded border border-slate-200">
          <div>
            <div className="text-slate-500 text-[11px]">حالة اليومية</div>
            <div className="font-bold text-brand-900 text-sm">
              {sheet.sheet.status === "posted" ? "معتمدة ومرحّلة" : sheet.sheet.status === "draft" ? "مسودة" : sheet.sheet.status}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[11px]">إجمالي السلال المشتراة</div>
            <div className="font-bold text-brand-900 text-sm num">{formatQuantity(grandTotalQty)} سلة</div>
          </div>
          <div>
            <div className="text-slate-500 text-[11px]">إجمالي قيمة الشراء</div>
            <div className="font-bold text-green-700 text-sm num">{formatAmount(grandTotalAmount)}</div>
          </div>
          <div>
            <div className="text-slate-500 text-[11px]">رقم الإصدار</div>
            <div className="font-bold text-slate-700 text-sm num">الإصدار {sheet.revision.revision_no}</div>
          </div>
        </div>

        {/* جدول المشتريات والتوزيع الفعلي */}
        <div>
          <h2 className="mb-2 text-xs font-bold text-brand-900">جدول المشتريات والتوزيع الفعلي على البقالات</h2>
          <table className="w-full border-collapse border border-slate-300">
            <thead className="bg-slate-100 font-bold text-slate-800 text-[11px]">
              <tr>
                <th className="border border-slate-300 p-2 text-center w-8">م</th>
                <th className="border border-slate-300 p-2 text-start">الصنف</th>
                <th className="border border-slate-300 p-2 text-start">المورد</th>
                <th className="border border-slate-300 p-2 text-center">سعر السلة</th>
                <th className="border border-slate-300 p-2 text-center">الكمية</th>
                <th className="border border-slate-300 p-2 text-center">إجمالي السطر</th>
                {stores.map((s) => (
                  <th key={s.id} className="border border-slate-300 p-2 text-center">
                    {s.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {purchasedLines.map((line, idx) => {
                const lineTotal = multiplyMoney(line.purchased_quantity, line.basket_unit_price || "0.00");
                return (
                  <tr key={line.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="num border border-slate-300 p-1.5 text-center text-slate-500">{idx + 1}</td>
                    <td className="border border-slate-300 p-1.5 font-bold text-slate-900">{line.productName}</td>
                    <td className="border border-slate-300 p-1.5 text-slate-700">{line.supplierName || "—"}</td>
                    <td className="num border border-slate-300 p-1.5 text-center font-semibold">
                      {formatAmount(line.basket_unit_price)}
                    </td>
                    <td className="num border border-slate-300 p-1.5 text-center font-bold">
                      {formatQuantity(line.purchased_quantity)}
                    </td>
                    <td className="num border border-slate-300 p-1.5 text-center font-black text-brand-900">
                      {formatAmount(lineTotal)}
                    </td>
                    {stores.map((s) => {
                      const d = line.dispositions.find((disp) => disp.store_id === s.id);
                      const q = d ? Number(d.quantity) : 0;
                      return (
                        <td
                          key={s.id}
                          className={`num border border-slate-300 p-1.5 text-center ${q > 0 ? "font-bold text-slate-800" : "text-slate-300"
                            }`}
                        >
                          {q > 0 ? formatQuantity(q) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {/* صف الإجماليات */}
            <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
              <tr>
                <td colSpan={4} className="border border-slate-300 p-2 text-center">
                  الإجمالي العام
                </td>
                <td className="num border border-slate-300 p-2 text-center font-black">
                  {formatQuantity(grandTotalQty)}
                </td>
                <td className="num border border-slate-300 p-2 text-center font-black text-green-800 text-sm">
                  {formatAmount(grandTotalAmount)}
                </td>
                {stores.map((s) => (
                  <td key={s.id} className="num border border-slate-300 p-2 text-center font-bold text-brand-900">
                    {formatQuantity(storeTotals[s.id]?.quantity || 0)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ملخص قيمة سحوبات كل بقالة */}
        <div>
          <h2 className="mb-2 text-xs font-bold text-brand-900">ملخص التكلفة المحملة على كل بقالة</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {stores.map((s) => {
              const data = storeTotals[s.id];
              return (
                <div key={s.id} className="rounded border border-slate-300 p-2.5 bg-white text-center">
                  <div className="font-bold text-brand-900 text-xs">
                    {s.code} · {s.name}
                  </div>
                  <div className="num font-bold text-slate-700 mt-1">
                    {formatQuantity(data?.quantity || 0)} سلة
                  </div>
                  <div className="num font-black text-green-700 text-sm mt-0.5">
                    {formatAmount(data?.amount || "0.00")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* الأصناف غير المشتراة أو الملغاة */}
        {unpurchasedLines.length > 0 && (
          <div className="rounded border border-rose-200 bg-rose-50/50 p-3">
            <h3 className="font-bold text-rose-900 mb-2">أصناف غير مشتراة / ملغاة</h3>
            <ul className="divide-y divide-rose-200 text-[11px]">
              {unpurchasedLines.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-1">
                  <span className="font-medium text-slate-800">{l.productName}</span>
                  <span className="text-slate-600">
                    السبب: {l.cancellation_reason || "لم يتوفر في السوق"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PdfDocumentLayout>
  );
}
