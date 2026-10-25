import { Alert } from "@/components/ui/status";
import { businessDate, isIsoDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import type { NightOrderLineRow, NightOrderRow, ProductRow, StoreRow } from "@/lib/supabase/types";
import { formatDate } from "@/lib/format";
import { BulkNightOrderMatrix } from "@/features/operations/bulk-night-order-matrix";
import Link from "next/link";
import { Printer } from "lucide-react";

export const metadata = { title: "إدخال طلبات الليل — كشف الصباح" };

export default async function WorkerNightOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date && isIsoDate(params.date) ? params.date : businessDate();
  const client = await createServerSupabase();

  const [storesResult, productsResult, ordersResult] = await Promise.all([
    client
      .from("stores")
      .select("id, code, name, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
    client
      .from("products")
      .select("id, code, name, unit_name, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
    client
      .from("night_orders")
      .select("id, business_date, store_id, status, version")
      .eq("business_date", date),
  ]);

  if (storesResult.error || productsResult.error || ordersResult.error) {
    return <Alert title="تعذر تحميل الطلبات">تحقق من الاتصال بقاعدة البيانات والصلاحيات.</Alert>;
  }

  const stores = (storesResult.data ?? []) as StoreRow[];
  const products = (productsResult.data ?? []) as ProductRow[];
  const orders = (ordersResult.data ?? []) as NightOrderRow[];

  // قراءة كل سطور الطلبات الحالية
  const orderIds = orders.map((o) => o.id);
  const linesResult = orderIds.length
    ? await client.from("night_order_lines").select("*").in("night_order_id", orderIds)
    : { data: [] };
  const allLines = (linesResult.data ?? []) as NightOrderLineRow[];

  // بناء initialData: productId -> storeId -> qty string
  const initialData: Record<string, Record<string, string>> = {};
  const orderStoreMap = new Map(orders.map((o) => [o.id, o.store_id]));

  for (const line of allLines) {
    const storeId = orderStoreMap.get(line.night_order_id);
    if (storeId) {
      if (!initialData[line.product_id]) initialData[line.product_id] = {};
      initialData[line.product_id]![storeId] = String(Number(line.quantity) || "");
    }
  }

  return (
    <div className="space-y-4">
      {/* الترويسة الرئيسية */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-950 text-white font-bold text-xs">
              🌙
            </span>
            <h1 className="text-xl font-black text-brand-900">طلبات البقالات ليلًا — لليوم التالي</h1>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            أدخل طلبات البقالات للخضروات ليوم الشراء المستهدف ({formatDate(date)}). حفظ الطلبات ينشئ كشف مشتريات الصباح آلياً.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* فلتر التاريخ */}
          <form className="flex items-center gap-1.5" action="" method="get">
            <label className="text-xs font-semibold text-slate-700">تاريخ الشراء:</label>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="num rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-xs font-bold text-slate-800"
            />
            <button
              type="submit"
              className="rounded-lg border border-brand-900 px-3 py-1.5 text-xs font-bold text-brand-900 hover:bg-brand-900 hover:text-white transition-colors"
            >
              تغيير
            </button>
          </form>

          {/* زر تنزيل PDF طلبات الصباح */}
          <Link
            href={`/reports/pdf/morning-orders?date=${date}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800"
          >
            <Printer size={15} />
            <span>كشف مشتريات الصباح PDF</span>
          </Link>
        </div>
      </header>

      {/* مصفوفة إدخال الطلبات الشاملة مع أزرار الكسور وزر الحفظ الرئيسي */}
      <BulkNightOrderMatrix
        date={date}
        stores={stores}
        products={products}
        initialData={initialData}
      />
    </div>
  );
}
