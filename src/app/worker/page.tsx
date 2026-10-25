import Link from "next/link";
import { Card, StatCard } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/status";
import { businessDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { DailySheetRow, NightOrderRow } from "@/lib/supabase/types";

export const metadata = { title: "مهام اليوم" };

export default async function WorkerDashboardPage() {
  const today = businessDate();
  const client = await createServerSupabase();
  const [sheetsResult, ordersResult] = await Promise.all([
    client.from("daily_sheets").select("id,business_date,status,version,current_revision_id,created_by,submitted_by,posted_by,closed_by,posted_at,closed_at,created_at,updated_at").eq("business_date", today).maybeSingle(),
    client.from("night_orders").select("id,business_date,store_id,status,version,created_by,submitted_at,created_at,updated_at").eq("business_date", today),
  ]);
  if (sheetsResult.error || ordersResult.error) return <Alert title="تعذر تحميل المهام">تحقق من اتصال قاعدة البيانات والصلاحيات.</Alert>;
  const sheet = sheetsResult.data as DailySheetRow | null;
  const orders = (ordersResult.data ?? []) as NightOrderRow[];
  const submitted = orders.filter((order) => order.status === "submitted").length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-brand-900">مهام اليوم</h1>
        <p className="text-sm text-slate-600">{formatDate(today)} · متابعة الطلبات والكشف</p>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="طلبات البقالات" value={String(orders.length)} />
        <StatCard label="طلبات مرسلة" value={String(submitted)} tone="green" />
        <StatCard label="حالة اليومية" value={sheet?.status ?? "غير مفتوحة"} tone="gold" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="طلبات الليل"><p className="mb-3 text-sm text-slate-600">أدخل الطلبات منفصلة عن القيود المالية.</p><Link href="/worker/night-orders" className="text-sm font-semibold text-brand-800 underline">فتح الطلبات</Link></Card>
        <Card title="كشف اليوم"><p className="mb-3 text-sm text-slate-600">أدخل المشتريات والتوزيعات وأرسل اليومية للمراجعة.</p><Link href="/worker/sheets" className="text-sm font-semibold text-brand-800 underline">فتح الكشف</Link></Card>
      </div>
    </div>
  );
}