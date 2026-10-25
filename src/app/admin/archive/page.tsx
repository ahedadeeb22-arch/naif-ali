import Link from "next/link";
import { Alert } from "@/components/ui/status";
import { ReopenSheetButton } from "@/features/operations/reopen-sheet-button";
import { CloseSheetButton } from "@/features/operations/close-sheet-button";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatDate, formatAmount } from "@/lib/format";
import type { DailySheetRow } from "@/lib/supabase/types";
import { Printer, SlidersHorizontal } from "lucide-react";

export const metadata = { title: "تقارير الأيام والأرشيف — التعديل الشامل" };

export default async function AdminArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; date?: string }>;
}) {
  const params = await searchParams;
  const client = await createServerSupabase();

  let query = client
    .from("daily_sheets")
    .select(
      "id, business_date, status, version, current_revision_id, created_by, submitted_by, posted_by, closed_by, posted_at, closed_at, created_at, updated_at",
    )
    .order("business_date", { ascending: false })
    .limit(100);

  if (params.from) query = query.gte("business_date", params.from);
  if (params.to) query = query.lte("business_date", params.to);

  const { data, error } = await query;
  if (error) {
    return <Alert title="تعذر تحميل الأرشيف">تحقق من اتصال قاعدة البيانات وصلاحية المدير.</Alert>;
  }

  const sheets = (data ?? []) as DailySheetRow[];

  // جلب مبالغ المراجعة للإصدارات
  const revIds = sheets.map((s) => s.current_revision_id).filter(Boolean) as string[];
  type RevisionSummary = {
    id: string;
    total_purchase_value: string | number;
    total_distributed_value: string | number;
    revision_no: number;
  };
  const { data: revsData } = revIds.length
    ? await client
        .from("daily_sheet_revisions")
        .select("id, total_purchase_value, total_distributed_value, revision_no")
        .in("id", revIds)
    : { data: [] };

  const revMap = new Map(((revsData ?? []) as RevisionSummary[]).map((r) => [r.id, r]));

  // اليوم المحدد للعرض التفصيلي
  const selectedDate = params.date || sheets[0]?.business_date;
  const selectedSheet = sheets.find((s) => s.business_date === selectedDate) || sheets[0];

  // جلب بيانات الكتالوج والسطور لليوم المحدد
  const [storesRes, productsRes, suppliersRes] = await Promise.all([
    client.from("stores").select("id, code, name").order("sort_order"),
    client.from("products").select("id, code, name").order("sort_order"),
    client.from("suppliers").select("id, name"),
  ]);

  const allStores = ((storesRes.data ?? []) as Array<{ id: string; code: string; name: string }>);
  const allProducts = ((productsRes.data ?? []) as Array<{ id: string; code: string; name: string }>);
  const allSuppliers = ((suppliersRes.data ?? []) as Array<{ id: string; name: string }>);
  const prodMap = new Map(allProducts.map((p) => [p.id, p.name]));
  const supMap = new Map(allSuppliers.map((s) => [s.id, s.name]));

  type LineDetail = {
    id: string;
    product_id: string;
    supplier_id: string | null;
    purchase_status: string;
    purchased_quantity: string;
    basket_unit_price: string | null;
  };

  type DispDetail = {
    purchase_line_id: string;
    store_id: string;
    quantity: string;
  };

  let detailLines: LineDetail[] = [];
  let detailDisps: DispDetail[] = [];

  if (selectedSheet?.current_revision_id) {
    const { data: lData } = await client
      .from("purchase_lines")
      .select("id, product_id, supplier_id, purchase_status, purchased_quantity, basket_unit_price")
      .eq("revision_id", selectedSheet.current_revision_id);
    detailLines = (lData ?? []) as LineDetail[];

    const lineIds = detailLines.map((l) => l.id);
    if (lineIds.length > 0) {
      const { data: dData } = await client
        .from("purchase_dispositions")
        .select("purchase_line_id, store_id, quantity")
        .in("purchase_line_id", lineIds);
      detailDisps = (dData ?? []) as DispDetail[];
    }
  }

  const selectedDayName = selectedSheet
    ? new Intl.DateTimeFormat("ar-YE", { weekday: "long" }).format(
        new Date(selectedSheet.business_date + "T12:00:00Z"),
      )
    : "";

  return (
    <div className="space-y-5">
      {/* الترويسة الرئيسية */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-xl font-black text-brand-900">تقارير الأيام السابقة والأرشيف</h1>
          <p className="mt-1 text-xs text-slate-600">
            مراجعة كشوف الأيام السابقة، استخراج التقارير والـ PDF، والتعديل الشامل الآمن مع قيد تصحيح لنفس التاريخ.
          </p>
        </div>

        {/* فلتر التاريخ */}
        <form className="flex flex-wrap items-end gap-2" action="" method="get">
          <label className="text-xs font-semibold text-slate-700">
            من:
            <input
              type="date"
              name="from"
              defaultValue={params.from || ""}
              className="mt-1 block rounded-lg border border-border-subtle bg-white px-2.5 py-1.5 text-xs font-bold"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            إلى:
            <input
              type="date"
              name="to"
              defaultValue={params.to || ""}
              className="mt-1 block rounded-lg border border-border-subtle bg-white px-2.5 py-1.5 text-xs font-bold"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-800"
          >
            تصفية
          </button>
        </form>
      </header>

      {/* بطاقات الأيام السابقة مع الإجمالي والأزرار المطلوبة */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sheets.map((sheet) => {
          const rev = sheet.current_revision_id ? revMap.get(sheet.current_revision_id) : null;
          const isPosted = sheet.status === "posted";
          const isClosed = sheet.status === "closed";

          return (
            <div
              key={sheet.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-all space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <span className="text-sm font-black text-brand-900">
                    {formatDate(sheet.business_date)}
                  </span>
                  <span className="num block text-[11px] text-slate-400">
                    {sheet.business_date}
                  </span>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                    isPosted
                      ? "bg-emerald-100 text-emerald-800"
                      : isClosed
                      ? "bg-slate-200 text-slate-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {isPosted ? "معتمدة" : isClosed ? "مغلقة" : sheet.status}
                </span>
              </div>

              {/* بطاقة الإجمالي والإصدار */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl">
                <div>
                  <span className="text-slate-500 block text-[10px]">إجمالي المشتريات</span>
                  <span className="num font-black text-brand-900 text-xs">
                    {rev ? formatAmount(rev.total_purchase_value) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">الإصدار والنسخة</span>
                  <span className="num font-bold text-slate-700 text-xs">
                    الإصدار {rev?.revision_no || 1} (v{sheet.version})
                  </span>
                </div>
              </div>

              {/* الأزرار والإجراءات المطلوبة: «عرض تقرير الكشف» و «تعديل شامل» */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                {/* زر عرض تقرير الكشف لتحديده وعرضه أدناه */}
                <Link
                  href={`/admin/archive?date=${sheet.business_date}`}
                  className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    sheet.business_date === selectedDate
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <Printer size={13} />
                  <span>📄 تقرير الكشف</span>
                </Link>

                {/* زر تعديل شامل للمدير بالشريط البنفسجي */}
                <Link
                  href={`/admin/sheets?date=${sheet.business_date}&edit=true`}
                  className="flex items-center gap-1 rounded-xl bg-purple-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-800 shadow-xs"
                >
                  <SlidersHorizontal size={13} />
                  <span>✏️ تعديل شامل</span>
                </Link>

                {/* أزرار إعادة الفتح والإغلاق إن لزم */}
                {(isPosted || isClosed) && (
                  <ReopenSheetButton sheetId={sheet.id} version={sheet.version} />
                )}
                {isPosted && (
                  <CloseSheetButton sheetId={sheet.id} version={sheet.version} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* عرض كشف الحساب المنفرد لليوم المحدد (مطابق للشاشة 2) */}
      {/* ======================================================== */}
      {selectedSheet && (
        <section className="rounded-2xl border-2 border-[#6c5ce7] bg-[#fbfaff] p-5 shadow-sm space-y-4 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6c5ce7] text-white font-bold text-xs">
                  📑
                </span>
                <h2 className="text-base font-black text-slate-900">
                  كشف حساب وتقرير يوم:{" "}
                  <span className="text-[#6c5ce7]">
                    {selectedDayName} ({formatDate(selectedSheet.business_date)})
                  </span>
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                يعرض هذا الكشف ملخص ما تم شراؤه وتوزيعه في هذا اليوم المنفرد. لتعديل أي رقم أو إضافة مشتريات، اضغط زر (تعديل شامل).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/sheets?date=${selectedSheet.business_date}&edit=true`}
                className="flex items-center gap-1.5 rounded-xl bg-[#6c5ce7] hover:bg-[#5a48d8] text-white px-3.5 py-2 text-xs font-bold shadow-xs transition-all"
              >
                <SlidersHorizontal size={14} />
                <span>✏️ فتح هذا اليوم في واجهة الكشف اليومي لتعديله بالكامل</span>
              </Link>
              <Link
                href={`/reports/pdf/daily-sheet?date=${selectedSheet.business_date}`}
                target="_blank"
                className="flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition-all"
              >
                <Printer size={14} />
                <span>🖨️ طباعة كشف اليوم PDF</span>
              </Link>
            </div>
          </div>

          {/* جدول كشف حساب اليوم المنفرد */}
          <div className="overflow-x-auto rounded-xl border border-purple-200 bg-white shadow-xs">
            <table className="w-full min-w-[850px] border-collapse text-xs">
              <thead className="bg-[#6c5ce7] text-white font-bold border-b border-purple-700">
                <tr>
                  <th className="p-2.5 text-start min-w-32">الصنف</th>
                  {allStores.map((s) => (
                    <th key={s.id} className="p-2.5 text-center min-w-16 border-l border-white/20">
                      {s.code} ({s.name})
                    </th>
                  ))}
                  <th className="p-2.5 text-center bg-[#2f3542] text-white font-black min-w-24 border-l border-white/20">
                    العدد المشترى
                  </th>
                  <th className="p-2.5 text-center min-w-24 border-l border-white/20">السعر</th>
                  <th className="p-2.5 text-center min-w-28 border-l border-white/20">المورد</th>
                  <th className="p-2.5 text-center bg-purple-900 text-white font-black min-w-28 border-l border-white/20">
                    إجمالي الصنف
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-100">
                {detailLines.length === 0 ? (
                  <tr>
                    <td colSpan={allStores.length + 5} className="p-6 text-center text-slate-400">
                      لا توجد سطور مسجلة في كشف هذا اليوم بعد.
                    </td>
                  </tr>
                ) : (
                  detailLines.map((line, idx) => {
                    const price = parseFloat(line.basket_unit_price || "0") || 0;
                    const qty = parseFloat(line.purchased_quantity || "0") || 0;
                    const lineTotal = price * qty;
                    const lineDisps = detailDisps.filter((d) => d.purchase_line_id === line.id);

                    return (
                      <tr key={line.id} className={idx % 2 === 0 ? "bg-white" : "bg-purple-50/20"}>
                        <td className="p-2.5 font-black text-slate-900">
                          {prodMap.get(line.product_id) || "صنف"}
                        </td>
                        {allStores.map((s) => {
                          const disp = lineDisps.find((d) => d.store_id === s.id);
                          const dq = disp ? parseFloat(disp.quantity) : 0;
                          return (
                            <td
                              key={s.id}
                              className={`num p-2.5 text-center border-l border-slate-100 ${
                                dq > 0 ? "font-bold text-slate-900" : "text-slate-300"
                              }`}
                            >
                              {dq > 0 ? dq : "—"}
                            </td>
                          );
                        })}
                        <td className="num p-2.5 text-center font-black text-[#0c2461] bg-slate-50 border-l border-slate-100">
                          {qty > 0 ? qty : "—"}
                        </td>
                        <td className="num p-2.5 text-center font-bold text-slate-800 border-l border-slate-100">
                          {price > 0 ? formatAmount(price) : "—"}
                        </td>
                        <td className="p-2.5 text-center text-slate-700 font-semibold border-l border-slate-100">
                          {line.supplier_id ? supMap.get(line.supplier_id) || "—" : "—"}
                        </td>
                        <td className="num p-2.5 text-center font-black text-emerald-800 bg-emerald-50/50 border-l border-slate-100">
                          {lineTotal > 0 ? formatAmount(lineTotal) : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
