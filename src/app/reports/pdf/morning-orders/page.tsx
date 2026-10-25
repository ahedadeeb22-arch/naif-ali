import { PdfDocumentLayout } from "@/components/pdf/pdf-document-layout";
import { formatDate, formatQuantity } from "@/lib/format";
import { businessDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import type { NightOrderLineRow, NightOrderRow, ProductRow, StoreRow } from "@/lib/supabase/types";

export const metadata = { title: "كشف مشتريات الصباح PDF" };

export default async function MorningOrdersPdfPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || businessDate();
  const client = await createServerSupabase();

  const [storesRes, productsRes, ordersRes] = await Promise.all([
    client.from("stores").select("id, code, name, sort_order").eq("active", true).order("sort_order"),
    client.from("products").select("id, code, name, unit_name, sort_order").eq("active", true).order("sort_order"),
    client.from("night_orders").select("*").eq("business_date", date),
  ]);

  const stores = (storesRes.data ?? []) as StoreRow[];
  const products = (productsRes.data ?? []) as ProductRow[];
  const orders = (ordersRes.data ?? []) as NightOrderRow[];

  const orderIds = orders.map((o) => o.id);
  const linesRes = orderIds.length
    ? await client.from("night_order_lines").select("*").in("night_order_id", orderIds)
    : { data: [] };
  const lines = (linesRes.data ?? []) as NightOrderLineRow[];

  // بناء مصفوفة سريعة للكميات: productId -> { storeId: quantity }
  const qtyMap: Record<string, Record<string, number>> = {};
  for (const p of products) {
    qtyMap[p.id] = {};
    for (const s of stores) {
      qtyMap[p.id]![s.id] = 0;
    }
  }

  const orderStoreMap = new Map(orders.map((o) => [o.id, o.store_id]));
  for (const line of lines) {
    const storeId = orderStoreMap.get(line.night_order_id);
    if (storeId && qtyMap[line.product_id]) {
      qtyMap[line.product_id]![storeId] = Number(line.quantity) || 0;
    }
  }

  // حساب إجمالي كل صنف
  const productTotals: Record<string, number> = {};
  for (const p of products) {
    let tot = 0;
    for (const s of stores) {
      tot += qtyMap[p.id]?.[s.id] || 0;
    }
    productTotals[p.id] = tot;
  }

  // فلترة الأصناف التي لديها كميات مطلوبة أو إظهار الـ 16 صنف بالكامل حسب المواصفات
  // المواصفات: يجب أن تظهر الأصناف الأساسية تلقائياً
  const displayProducts = products;

  // بطاقات الفرز لكل بقالة
  const storeCards = stores.map((s) => {
    const requestedItems = displayProducts
      .map((p) => ({
        productName: p.name,
        quantity: qtyMap[p.id]?.[s.id] || 0,
        unit: p.unit_name || "سلة",
      }))
      .filter((item) => item.quantity > 0);

    const totalQty = requestedItems.reduce((acc, i) => acc + i.quantity, 0);

    return {
      store: s,
      items: requestedItems,
      totalQty,
    };
  });

  return (
    <PdfDocumentLayout
      title="كشف مشتريات الخضروات الصباحي"
      subtitle="كشف متطلبات الشراء والفرز حسب طلبات الليل المحفوظة (بدون أسعار وموردين)"
      dateStr={formatDate(date)}
      documentNo={`MORNING-${date.replace(/-/g, "")}`}
      landscape={true}
      backHref="/worker"
      backLabel="واجهة العامل"
    >
      <div className="space-y-6">
        {/* ملاحظة توجيهية */}
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <strong>ملاحظة للمشتري:</strong> هذا الكشف مخصص لشراء وفرز طلبيات الصباح من السوق، لا يحتوي على أسعار أو موردين.
        </div>

        {/* الجدول الشامل لجميع البقالات والأصناف */}
        <div>
          <h2 className="mb-2 text-xs font-bold text-brand-900">جدول المتطلبات الإجمالية وتوزيع البقالات</h2>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <thead className="bg-slate-100 font-bold text-slate-800">
              <tr>
                <th className="border border-slate-300 p-2 text-center w-10">م</th>
                <th className="border border-slate-300 p-2 text-start">الصنف</th>
                {stores.map((s) => (
                  <th key={s.id} className="border border-slate-300 p-2 text-center min-w-16">
                    {s.code} ({s.name})
                  </th>
                ))}
                <th className="border border-slate-300 p-2 text-center bg-brand-900/10 text-brand-900 font-black min-w-20">
                  إجمالي المطلوب
                </th>
                <th className="border border-slate-300 p-2 text-center min-w-20">حالة الشراء</th>
              </tr>
            </thead>
            <tbody>
              {displayProducts.map((p, idx) => {
                const total = productTotals[p.id] || 0;
                return (
                  <tr key={p.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="num border border-slate-300 p-2 text-center text-slate-500">{idx + 1}</td>
                    <td className="border border-slate-300 p-2 font-bold text-slate-900">{p.name}</td>
                    {stores.map((s) => {
                      const q = qtyMap[p.id]?.[s.id] || 0;
                      return (
                        <td
                          key={s.id}
                          className={`num border border-slate-300 p-2 text-center ${q > 0 ? "font-bold text-brand-900" : "text-slate-300"
                            }`}
                        >
                          {q > 0 ? formatQuantity(q) : "—"}
                        </td>
                      );
                    })}
                    <td className="num border border-slate-300 p-2 text-center font-black bg-brand-900/5 text-brand-900 text-sm">
                      {total > 0 ? `${formatQuantity(total)} سلة` : "—"}
                    </td>
                    <td className="border border-slate-300 p-2 text-center text-slate-400">
                      [ &nbsp; ] تم
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* بطاقات فرز منفصلة لكل بقالة */}
        <div>
          <h2 className="mb-2 text-xs font-bold text-brand-900">أقسام فرز وتوزيع البقالات المستقلة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {storeCards.map(({ store, items, totalQty }) => (
              <div key={store.id} className="rounded border border-slate-300 p-3 bg-white space-y-2">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                  <span className="font-bold text-xs text-brand-900">
                    {store.code} · {store.name}
                  </span>
                  <span className="num rounded bg-brand-900/10 px-2 py-0.5 text-[11px] font-black text-brand-900">
                    المجموع: {formatQuantity(totalQty)} سلة
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-[11px] text-slate-400">لا توجد أصناف مطلوبة</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-[11px]">
                    {items.map((it, i) => (
                      <li key={i} className="flex items-center justify-between py-1">
                        <span className="font-medium text-slate-700">{it.productName}</span>
                        <span className="num font-bold text-slate-900">
                          {formatQuantity(it.quantity)} {it.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PdfDocumentLayout>
  );
}
