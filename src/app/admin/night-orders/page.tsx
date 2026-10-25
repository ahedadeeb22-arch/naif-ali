import { Alert } from "@/components/ui/status";
import { businessDate, isIsoDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import type { NightOrderLineRow, NightOrderRow, ProductRow, StoreRow } from "@/lib/supabase/types";
import { formatDate } from "@/lib/format";
import { BulkNightOrderMatrix } from "@/features/operations/bulk-night-order-matrix";
import Link from "next/link";
import { Printer } from "lucide-react";

export const metadata = { title: "طلبات الليل — المدير" };

export default async function AdminNightOrdersPage({
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

  const orderIds = orders.map((o) => o.id);
  const linesResult = orderIds.length
    ? await client.from("night_order_lines").select("*").in("night_order_id", orderIds)
    : { data: [] };
  const allLines = (linesResult.data ?? []) as NightOrderLineRow[];

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
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-xl font-bold text-brand-900">طلبات البقالات ليلًا (مراجعة وتحرير المدير)</h1>
          <p className="text-xs text-slate-600">
            متابعة وإدخال طلبات البقالات ليوم {formatDate(date)}. الحفظ يقوم بتحديث الطلبات وإنشاء كشف الصباح.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-1.5" action="" method="get">
            <label className="text-xs font-semibold text-slate-700">التاريخ:</label>
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
              عرض
            </button>
          </form>

          <Link
            href={`/reports/pdf/morning-orders?date=${date}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800"
          >
            <Printer size={15} />
            <span>تنزيل كشف الصباح PDF</span>
          </Link>
        </div>
      </header>

      <BulkNightOrderMatrix
        date={date}
        stores={stores}
        products={products}
        initialData={initialData}
      />
    </div>
  );
}
