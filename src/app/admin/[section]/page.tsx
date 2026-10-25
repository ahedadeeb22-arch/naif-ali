import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/status";
import { CatalogManager, type CatalogEntity, type CatalogRecord } from "@/features/operations/catalog-manager";
import { UserManager } from "@/features/operations/user-manager-v2";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { AuditLogRow, ProductRow, ProfileRow, StoreMembershipRow, StoreRow, SupplierRow } from "@/lib/supabase/types";
import { Card } from "@/components/ui/primitives";

const catalogSections: Record<string, { entity: CatalogEntity; title: string }> = {
  stores: { entity: "stores", title: "إدارة البقالات" },
  suppliers: { entity: "suppliers", title: "إدارة الموردين" },
  products: { entity: "products", title: "إدارة الأصناف" },
};

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const profile = await requireRole(["admin"]);
  const client = await createServerSupabase();

  const config = catalogSections[section];
  if (config) {
    if (config.entity === "stores") {
      const { data, error } = await client.from("stores").select("id,code,name,sort_order,active,created_at,updated_at").order("sort_order");
      if (error) return <Alert title="تعذر تحميل البقالات">تحقق من صلاحية المدير.</Alert>;
      const records = ((data ?? []) as StoreRow[]).map((row): CatalogRecord => ({ ...row }));
      return <CatalogManager entity={config.entity} title={config.title} records={records} />;
    }
    if (config.entity === "suppliers") {
      const { data, error } = await client.from("suppliers").select("id,code,name,active,notes,created_at,updated_at").order("name");
      if (error) return <Alert title="تعذر تحميل الموردين">تحقق من صلاحية المدير.</Alert>;
      const records = ((data ?? []) as SupplierRow[]).map((row): CatalogRecord => ({ ...row }));
      return <CatalogManager entity={config.entity} title={config.title} records={records} />;
    }
    const { data, error } = await client.from("products").select("id,code,name,unit_name,sort_order,active,created_at,updated_at").order("sort_order");
    if (error) return <Alert title="تعذر تحميل الأصناف">تحقق من صلاحية المدير.</Alert>;
    const records = ((data ?? []) as ProductRow[]).map((row): CatalogRecord => ({ ...row }));
    return <CatalogManager entity={config.entity} title={config.title} records={records} />;
  }

  if (section === "users") {
    const [profilesResult, membershipsResult, storesResult, overridesResult, auditResult] = await Promise.all([
      client.from("profiles").select("user_id,code,display_name,role,active,created_at,updated_at").order("display_name"),
      client.from("store_memberships").select("user_id,store_id,active,created_at,created_by"),
      client.from("stores").select("id,code,name,sort_order,active,created_at,updated_at").order("sort_order"),
      client.from("user_permission_overrides").select("user_id,permission_code,allowed"),
      client.from("audit_log").select("id,actor_id,action,entity_type,entity_id,revision_id,occurred_at,request_id,reason,before_data,after_data,metadata").order("occurred_at", { ascending: false }).limit(50),
    ]);
    if (profilesResult.error || membershipsResult.error || storesResult.error) return <Alert title="تعذر تحميل المستخدمين">تحقق من سياسات الجداول وصلاحية المدير.</Alert>;
    return (
      <UserManager
        profiles={(profilesResult.data ?? []) as ProfileRow[]}
        memberships={(membershipsResult.data ?? []) as StoreMembershipRow[]}
        stores={(storesResult.data ?? []) as StoreRow[]}
        currentUserId={profile.userId}
        overrides={(overridesResult.data ?? []) as { user_id: string; permission_code: string; allowed: boolean }[]}
        auditLogs={(auditResult.data ?? []) as AuditLogRow[]}
      />
    );
  }

  if (section === "audit") {
    const { data, error } = await client.from("audit_log").select("id,actor_id,action,entity_type,entity_id,revision_id,occurred_at,request_id,reason,before_data,after_data,metadata").order("occurred_at", { ascending: false }).limit(100);
    if (error) return <Alert title="تعذر تحميل سجل التدقيق">تحقق من صلاحية قراءة سجل التدقيق.</Alert>;
    const logs = (data ?? []) as AuditLogRow[];
    return <div className="space-y-4"><header><h1 className="text-xl font-bold text-brand-900">سجل التدقيق</h1><p className="text-sm text-slate-600">آخر 100 حدث. السجل للقراءة فقط.</p></header><Card>{logs.length === 0 ? <p className="text-center text-sm text-slate-500">لا توجد أحداث مسجلة.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="border-b border-border-subtle bg-surface"><tr><th className="px-3 py-2 text-start">الوقت</th><th className="px-3 py-2 text-start">العملية</th><th className="px-3 py-2 text-start">الكيان</th><th className="px-3 py-2 text-start">السبب</th><th className="px-3 py-2 text-start">التفاصيل</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-b border-border-subtle align-top"><td className="px-3 py-2">{formatDateTime(log.occurred_at)}</td><td className="px-3 py-2">{log.action}</td><td className="px-3 py-2">{log.entity_type}<small className="num block max-w-36 truncate text-slate-500">{log.entity_id}</small></td><td className="px-3 py-2">{log.reason ?? "—"}</td><td className="px-3 py-2"><details><summary className="cursor-pointer text-brand-800">عرض البيانات</summary><pre className="num mt-2 max-h-56 max-w-[32rem] overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-2 text-[10px]">{JSON.stringify({ before: log.before_data, after: log.after_data, metadata: log.metadata }, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}</Card></div>;
  }

  notFound();
}