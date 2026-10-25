import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { Alert } from "@/components/ui/status";
import { StatementView, type StatementData } from "@/features/operations/statement-view";
import { businessDate, isIsoDate } from "@/features/accounting/domain/period";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { callRpc } from "@/lib/rpc";
import type { StoreMembershipRow, StoreRow } from "@/lib/supabase/types";
import { Printer, Store as StoreIcon } from "lucide-react";

export const metadata = { title: "بوابة صاحب البقالة — كشف الحساب" };

export default async function StorePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = businessDate();
  const from = params.from && isIsoDate(params.from) ? params.from : today;
  const to = params.to && isIsoDate(params.to) ? params.to : today;
  const client = await createServerSupabase();

  const profile = await requireProfile();
  let memberships: StoreMembershipRow[] = [];

  if (profile.role === "admin") {
    // يسمح للمدير بالاطلاع على بوابة أي بقالة أو جميع البقالات
    const { data: allStores } = await client.from("stores").select("id, code, name").order("sort_order");
    memberships = ((allStores ?? []) as StoreRow[]).map((s) => ({
      store_id: s.id,
      user_id: profile.userId,
      active: true,
      created_at: "",
      created_by: null,
    }));
  } else {
    // جلب عضويات صاحب البقالة المصادق عليه حصراً (عزل كامل عبر RLS)
    const { data: membershipData, error: membershipError } = await client
      .from("store_memberships")
      .select("user_id, store_id, active, created_at, created_by")
      .eq("active", true);

    if (membershipError) {
      return <Alert title="تعذر تحميل عضويات الحساب">تحقق من تسجيل الدخول وسياسات قاعدة البيانات.</Alert>;
    }
    memberships = (membershipData ?? []) as StoreMembershipRow[];
  }
  if (!memberships.length) {
    return (
      <Card title="لا توجد بقالات مرتبطة بحسابك">
        <p className="text-sm text-slate-600">
          هذا الحساب غير مرتبط بأي بقالة بعد. يرجى التواصل مع المدير لربط حسابك ببقالتك لتتمكن من استعراض كشف الحساب والمسحوبات اليومية.
        </p>
      </Card>
    );
  }

  const { data: storeData, error: storeError } = await client
    .from("stores")
    .select("id, code, name, sort_order, active, created_at, updated_at")
    .in(
      "id",
      memberships.map((item) => item.store_id),
    )
    .order("sort_order");

  if (storeError) {
    return <Alert title="تعذر تحميل بيانات البقالة">أعد المحاولة أو تواصل مع المدير.</Alert>;
  }

  const stores = (storeData ?? []) as StoreRow[];
  const results = await Promise.all(
    stores.map(async (store) => {
      try {
        const statement = await callRpc<StatementData>(client, "store_statement", {
          p_store_id: store.id,
          p_from: from,
          p_to: to,
        });
        return { store, statement };
      } catch {
        return { store, statement: null };
      }
    }),
  );

  return (
    <div className="space-y-5">
      {/* الترويسة الرئيسية للبوابة */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-900 font-bold text-white text-sm">
              <StoreIcon size={18} />
            </span>
            <h1 className="text-xl font-black text-brand-900">بوابة صاحب البقالة</h1>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            كشف حساب مستقل وخاص ببقالتك. استعراض تفاصيل الخضروات المستلمة يومياً، الدفعات، والرصيد المتبقي.
          </p>
        </div>

        {/* نموذج الفلترة وتحديد الفترة */}
        <form className="flex flex-wrap items-end gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
          <label className="text-xs font-semibold text-slate-700">
            من:
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-0.5 block rounded-lg border border-border-subtle px-2.5 py-1 text-xs font-bold"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            إلى:
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-0.5 block rounded-lg border border-border-subtle px-2.5 py-1 text-xs font-bold"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-800"
          >
            تحديث
          </button>
        </form>
      </header>

      {/* عرض كشف كل بقالة مصرح بها مع إمكانية التنزيل والطباعة PDF */}
      {results.map(({ store, statement }) => {
        if (!statement) {
          return (
            <Alert key={store.id} title={`تعذر تحميل كشف ${store.name}`}>
              تحقق من صلاحيات البقالة في قاعدة البيانات.
            </Alert>
          );
        }

        return (
          <div key={store.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">
                كشف: {store.code} · {store.name}
              </span>
              <Link
                href={`/reports/pdf/store-statement?store=${store.id}&from=${from}&to=${to}`}
                target="_blank"
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Printer size={14} />
                <span>طباعة وتنزيل PDF</span>
              </Link>
            </div>

            <StatementView
              statement={statement}
              partyName={`${store.code} · ${store.name}`}
              partyKind="store"
            />
          </div>
        );
      })}
    </div>
  );
}
