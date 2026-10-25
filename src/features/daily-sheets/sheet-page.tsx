import Link from "next/link";
import { businessDate, isIsoDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadCatalog, loadSheetByDate } from "@/features/daily-sheets/data";
import { UnifiedWorkerSheet } from "@/features/daily-sheets/unified-worker-sheet";
import { Alert } from "@/components/ui/status";
import type { AppRole } from "@/lib/auth/session";
import type { NightOrderLineRow, NightOrderRow } from "@/lib/supabase/types";

export async function SheetPage({
  role,
  searchDate,
  isComprehensiveEdit = false,
}: {
  role: AppRole;
  searchDate?: string;
  isComprehensiveEdit?: boolean;
}) {
  const date = searchDate && isIsoDate(searchDate) ? searchDate : businessDate();
  const supabase = await createServerSupabase();
  let sheet = null as Awaited<ReturnType<typeof loadSheetByDate>>;
  let catalog: Awaited<ReturnType<typeof loadCatalog>> | null = null;
  let loadError: unknown;

  try {
    [sheet, catalog] = await Promise.all([
      loadSheetByDate(supabase, date),
      loadCatalog(supabase),
    ]);
  } catch (error) {
    loadError = error;
  }

  if (loadError || !catalog) {
    return (
      <Alert title="تعذر تحميل اليومية">
        {loadError instanceof Error && loadError.message.includes("إعداد Supabase")
          ? "أضف متغيرات Supabase في .env.local وطبّق ترحيلات قاعدة البيانات أولًا."
          : "حدث خطأ في قراءة البيانات. تحقق من الاتصال والصلاحيات وحاول مجددًا."}
      </Alert>
    );
  }

  // جلب طلبات الليل المحفوظة لعرضها في القسم السفلي المحفوظ
  const { data: nightOrdersData } = await supabase
    .from("night_orders")
    .select("id, store_id, business_date, status")
    .eq("business_date", date);

  const nightOrders = (nightOrdersData ?? []) as NightOrderRow[];
  const nightOrderIds = nightOrders.map((o) => o.id);
  const { data: linesData } = nightOrderIds.length
    ? await supabase.from("night_order_lines").select("*").in("night_order_id", nightOrderIds)
    : { data: [] };
  const nightLines = (linesData ?? []) as NightOrderLineRow[];

  const productNameMap = new Map(catalog.products.map((p) => [p.id, p.name]));
  const storeMap = new Map(catalog.stores.map((s) => [s.id, s]));

  const savedNightOrders = nightOrders.map((order) => {
    const s = storeMap.get(order.store_id);
    const lines = nightLines.filter((l) => l.night_order_id === order.id);
    return {
      storeId: order.store_id,
      storeName: s?.name || "بقالة",
      storeCode: s?.code || "—",
      items: lines.map((l) => ({
        productId: l.product_id,
        productName: productNameMap.get(l.product_id) || "صنف",
        quantity: String(Number(l.quantity) || 0),
      })),
    };
  });

  return (
    <div className="space-y-4">
      {/* شريط بنفسجي ملكي لوضع التعديل الشامل للمدير مطابق للنموذج المرجعي */}
      {isComprehensiveEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#8e44ad] p-4 text-white shadow-lg border-r-8 border-[#f6b93b]">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-xs font-black">
                🔓
              </span>
              <h2 className="text-base font-black">
                وضع التعديل الشامل للمدير مفعل الآن على كشف: <span className="text-[#ffeaa7] underline font-black">{date}</span>
              </h2>
            </div>
            <p className="mt-1 text-xs text-purple-100">
              يمكنك تعديل كميات البقالات، أو زيادة العدد الإجمالي (شراء إضافي)، أو تعديل السعر والمورد، وسيتم الترحيل الآمن بنفس تاريخ هذا اليوم دون تغييره ودون المساس بالسندات النقدية السابقة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/archive"
              className="flex items-center gap-1 rounded-xl bg-slate-900/80 hover:bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition-all shadow-xs"
            >
              <span>↩️ العودة لصفحة التقارير</span>
            </Link>
          </div>
        </div>
      )}

      {/* واجهة الكشف الموحدة المتوافقة مع Mobile-First والمتطلبات */}
      <UnifiedWorkerSheet
        initialSheet={sheet}
        products={catalog.products}
        suppliers={catalog.suppliers}
        stores={catalog.stores}
        date={date}
        role={role === "worker" ? "worker" : "admin"}
        savedNightOrders={savedNightOrders}
      />
    </div>
  );
}
