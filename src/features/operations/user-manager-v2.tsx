"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import {
  setStoreMembershipAction,
  updateProfileAction,
  setUserPermissionOverrideAction,
} from "@/features/operations/actions";
import { formatDate, formatDateTime } from "@/lib/format";
import type { AppRole, AuditLogRow, ProfileRow, StoreMembershipRow, StoreRow } from "@/lib/supabase/types";
import { Store, Truck, Plus, Users, ShieldCheck } from "lucide-react";

const WORKER_PERMISSIONS = [
  { code: "worker.can_add_supplier", label: "السماح بإضافة مورد" },
  { code: "worker.can_add_product", label: "السماح بإضافة صنف" },
  { code: "worker.can_edit_quantities", label: "السماح بتعديل كميات البقالات" },
  { code: "worker.can_edit_total", label: "السماح بتعديل العدد الإجمالي" },
];

export interface PermissionOverride {
  user_id: string;
  permission_code: string;
  allowed: boolean;
}

function UserRow({
  profile,
  memberships,
  stores,
  currentUserId,
  overrides,
}: {
  profile: ProfileRow;
  memberships: StoreMembershipRow[];
  stores: StoreRow[];
  currentUserId: string;
  overrides: PermissionOverride[];
}) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name);
  const [role, setRole] = useState<AppRole>(profile.role);
  const [active, setActive] = useState(profile.active);
  const [storeId, setStoreId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const saveProfile = async () => {
    setPending(true);
    const result = await updateProfileAction({
      userId: profile.user_id,
      displayName: name,
      role,
      active,
    });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };

  const updateMembership = async (id: string, enabled: boolean) => {
    setPending(true);
    const result = await setStoreMembershipAction({
      userId: profile.user_id,
      storeId: id,
      active: enabled,
    });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };

  const togglePermission = async (permCode: string, currentVal: boolean) => {
    setPending(true);
    const result = await setUserPermissionOverrideAction({
      userId: profile.user_id,
      permissionCode: permCode,
      allowed: !currentVal,
    });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };

  const isWorker = role === "worker";

  return (
    <tr className="border-b border-border-subtle align-top hover:bg-slate-50/50 transition-colors">
      <td className="px-3 py-3">
        <input
          aria-label="اسم المستخدم"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-w-36 rounded-lg border border-border-subtle bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
        />
        <p className="num mt-1 max-w-48 truncate text-[10px] text-slate-400">{profile.user_id}</p>
      </td>

      <td className="px-3 py-3">
        <select
          aria-label="الدور"
          value={role}
          disabled={profile.user_id === currentUserId}
          onChange={(event) => setRole(event.target.value as AppRole)}
          className="rounded-lg border border-border-subtle bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
        >
          <option value="admin">مدير (Admin)</option>
          <option value="worker">عامل (Worker)</option>
          <option value="store_owner">صاحب بقالة (Store Owner)</option>
        </select>
      </td>

      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          aria-label="الحساب نشط"
          checked={active}
          disabled={profile.user_id === currentUserId}
          onChange={(event) => setActive(event.target.checked)}
          className="h-4 w-4 rounded accent-brand-900"
        />
      </td>

      {/* عضويات البقالات */}
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {memberships
            .filter((m) => m.user_id === profile.user_id && m.active)
            .map((m) => {
              const store = stores.find((s) => s.id === m.store_id);
              return (
                <button
                  key={m.store_id}
                  type="button"
                  disabled={pending}
                  onClick={() => updateMembership(m.store_id, false)}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700"
                >
                  {store?.code || "بقالة"} ×
                </button>
              );
            })}

          <select
            aria-label="إضافة عضوية بقالة"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="max-w-36 rounded-lg border border-border-subtle bg-white px-2 py-1 text-xs"
          >
            <option value="">ربط بقالة...</option>
            {stores
              .filter(
                (s) =>
                  !memberships.some(
                    (m) => m.user_id === profile.user_id && m.store_id === s.id && m.active,
                  ),
              )
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
          </select>
          {storeId && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                updateMembership(storeId, true);
                setStoreId("");
              }}
              className="rounded-lg bg-brand-900 px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-800"
            >
              إضافة
            </button>
          )}
        </div>
      </td>

      {/* مفاتيح صلاحيات العامل الوظيفية */}
      <td className="px-3 py-3">
        {isWorker ? (
          <div className="space-y-1.5 text-[11px]">
            {WORKER_PERMISSIONS.map((p) => {
              const ov = overrides.find(
                (o) => o.user_id === profile.user_id && o.permission_code === p.code,
              );
              // القيمة الافتراضية true إذا لم تُعطل
              const isAllowed = ov ? ov.allowed : true;

              return (
                <label
                  key={p.code}
                  className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                >
                  <input
                    type="checkbox"
                    checked={isAllowed}
                    disabled={pending}
                    onChange={() => togglePermission(p.code, isAllowed)}
                    className="rounded accent-brand-900"
                  />
                  <span className={isAllowed ? "text-slate-800 font-medium" : "text-slate-400 line-through"}>
                    {p.label}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <span className="text-xs text-slate-400">
            {role === "admin" ? "صلاحيات كاملة للمدير" : "صلاحيات قراءة فقط للبقالة"}
          </span>
        )}
      </td>

      {/* حفظ التعديل */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={saveProfile}
            className="rounded-lg bg-brand-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            حفظ
          </button>
          {message ? <span className="text-[11px] font-bold text-emerald-700">{message}</span> : null}
        </div>
      </td>
    </tr>
  );
}

export function UserManager({
  profiles,
  memberships,
  stores,
  currentUserId,
  overrides = [],
  auditLogs = [],
}: {
  profiles: ProfileRow[];
  memberships: StoreMembershipRow[];
  stores: StoreRow[];
  currentUserId: string;
  overrides?: PermissionOverride[];
  auditLogs?: AuditLogRow[];
}) {
  const router = useRouter();
  const workers = profiles.filter((p) => p.role === "worker");

  // التحقق من حالة مفاتيح الصلاحيات العامة للعامل
  const checkWorkerPerm = (permCode: string) => {
    if (workers.length === 0) return true;
    return workers.some((w) => {
      const ov = overrides.find((o) => o.user_id === w.user_id && o.permission_code === permCode);
      return ov ? ov.allowed : true;
    });
  };

  const [canAddSupplier, setCanAddSupplier] = useState(() => checkWorkerPerm("worker.can_add_supplier"));
  const [canAddProduct, setCanAddProduct] = useState(() => checkWorkerPerm("worker.can_add_product"));
  const [canEditQuantities, setCanEditQuantities] = useState(() => checkWorkerPerm("worker.can_edit_quantities"));
  const [togglePending, setTogglePending] = useState(false);

  const toggleGlobalWorkerPerm = async (
    permCode: string,
    currentVal: boolean,
    setter: (val: boolean) => void
  ) => {
    setTogglePending(true);
    const nextVal = !currentVal;
    setter(nextVal);

    // تطبيق على جميع العمال
    for (const w of workers) {
      await setUserPermissionOverrideAction({
        userId: w.user_id,
        permissionCode: permCode,
        allowed: nextVal,
      });
    }
    setTogglePending(false);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* الترويسة الرئيسية وأزرار إدارة الكيانات */}
      <header className="rounded-2xl border border-border-subtle bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-900 text-white font-bold text-sm">
              ⚙️
            </span>
            <div>
              <h1 className="text-lg font-black text-brand-900">
                لوحة تحكم المدير بصلاحيات العامل وإدارة البقالات وسجل التدقيق
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                التحكم الفوري بميزات العامل، إدارة الكيانات والمستخدمين، ومراقبة سجل العمليات الدقيق.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/stores"
              className="flex items-center gap-1 rounded-xl bg-[#0652DD] hover:bg-[#0542b3] text-white px-3 py-1.5 text-xs font-bold shadow-xs transition-all"
            >
              <Store size={14} />
              <span>🏪 + إضافة بقالة جديدة</span>
            </Link>
            <Link
              href="/admin/suppliers"
              className="flex items-center gap-1 rounded-xl bg-[#e58e26] hover:bg-[#d07e1c] text-white px-3 py-1.5 text-xs font-bold shadow-xs transition-all"
            >
              <Truck size={14} />
              <span>➕ إضافة مورد جديد</span>
            </Link>
            <Link
              href="/admin/products"
              className="flex items-center gap-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-xs font-bold shadow-xs transition-all"
            >
              <Plus size={14} />
              <span>➕ إضافة صنف خضار</span>
            </Link>
          </div>
        </div>

        {/* أولاً: مفاتيح فتح وإغلاق الخدمات للعامل (Switches تتبدل بضغطة زر فورية) */}
        <div>
          <h2 className="text-xs font-black text-brand-900 mb-3">
            أولاً: مفاتيح فتح وإغلاق الخدمات للعامل (تعمل بضغطة زر فورية ومحفوظة في قاعدة البيانات):
          </h2>

          <div className="space-y-2.5">
            {/* المفتاح 1 */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <strong className="text-xs text-slate-900 block font-black">
                  1. السماح للعامل بإضافة (مورد جديد) إلى قائمة الموردين
                </strong>
                <span className="text-[11px] text-slate-500">
                  إذا أغلقت هذه الميزة، يلتزم العامل بالموردين الموجودين في القائمة المنسدلة فقط.
                </span>
              </div>
              <button
                type="button"
                disabled={togglePending}
                onClick={() =>
                  toggleGlobalWorkerPerm("worker.can_add_supplier", canAddSupplier, setCanAddSupplier)
                }
                className={`rounded-full px-4 py-1.5 text-xs font-black shadow-xs transition-all ${
                  canAddSupplier
                    ? "bg-[#2ed573] hover:bg-[#26af5f] text-white"
                    : "bg-[#ff4757] hover:bg-[#e03b4a] text-white"
                }`}
              >
                {canAddSupplier ? "مفتوح ✅" : "مغلق ❌"}
              </button>
            </div>

            {/* المفتاح 2 */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <strong className="text-xs text-slate-900 block font-black">
                  2. السماح للعامل بإضافة (صنف خضروات جديد) إلى جدول الكشف
                </strong>
                <span className="text-[11px] text-slate-500">
                  يتيح للعامل إضافة سطر لصنف جديد غير موجود في الأصناف الأساسية الـ 16.
                </span>
              </div>
              <button
                type="button"
                disabled={togglePending}
                onClick={() =>
                  toggleGlobalWorkerPerm("worker.can_add_product", canAddProduct, setCanAddProduct)
                }
                className={`rounded-full px-4 py-1.5 text-xs font-black shadow-xs transition-all ${
                  canAddProduct
                    ? "bg-[#2ed573] hover:bg-[#26af5f] text-white"
                    : "bg-[#ff4757] hover:bg-[#e03b4a] text-white"
                }`}
              >
                {canAddProduct ? "مفتوح ✅" : "مغلق ❌"}
              </button>
            </div>

            {/* المفتاح 3 */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div>
                <strong className="text-xs text-slate-900 block font-black">
                  3. السماح للعامل بتعديل كميات البقالات والعدد الإجمالي حتى نهاية اليوم
                </strong>
                <span className="text-[11px] text-slate-500">
                  إذا أغلقته، يقفل الكشف ولا يستطيع العامل تغيير أي رقم بعد حفظه.
                </span>
              </div>
              <button
                type="button"
                disabled={togglePending}
                onClick={() =>
                  toggleGlobalWorkerPerm(
                    "worker.can_edit_quantities",
                    canEditQuantities,
                    setCanEditQuantities
                  )
                }
                className={`rounded-full px-4 py-1.5 text-xs font-black shadow-xs transition-all ${
                  canEditQuantities
                    ? "bg-[#2ed573] hover:bg-[#26af5f] text-white"
                    : "bg-[#ff4757] hover:bg-[#e03b4a] text-white"
                }`}
              >
                {canEditQuantities ? "مفتوح ✅" : "مغلق ❌"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* قائمة المستخدمين وتفاصيل الصلاحيات الفردية */}
      <Card title={`إدارة حسابات المستخدمين وأصحاب البقالات (${profiles.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] border-collapse text-xs">
            <thead className="border-b border-border-subtle bg-surface text-slate-700 font-bold">
              <tr>
                <th className="px-3 py-2.5 text-start min-w-36">المستخدم</th>
                <th className="px-3 py-2.5 text-start min-w-28">الدور</th>
                <th className="px-3 py-2.5 text-center w-16">نشط</th>
                <th className="px-3 py-2.5 text-start min-w-44">ربط البقالات</th>
                <th className="px-3 py-2.5 text-start min-w-56">مفاتيح صلاحيات العامل</th>
                <th className="px-3 py-2.5 text-start w-24">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <UserRow
                  key={profile.user_id}
                  profile={profile}
                  memberships={memberships}
                  stores={stores}
                  currentUserId={currentUserId}
                  overrides={overrides}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ثانياً: سجل التدقيق والمراجعة الشامل (Audit Log) */}
      <Card title="ثانياً: سجل التدقيق والمراجعة الشامل (Audit Log) - يراقب كل حركة بالساعة والدقيقة">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-xs">
            <thead className="bg-[#2f3542] text-white font-bold border-b border-slate-700">
              <tr>
                <th className="px-3 py-2.5 text-center min-w-24">التاريخ</th>
                <th className="px-3 py-2.5 text-center min-w-24 border-l border-white/20">الوقت الدقيق</th>
                <th className="px-3 py-2.5 text-start min-w-36 border-l border-white/20">المستخدم</th>
                <th className="px-3 py-2.5 text-start min-w-32 border-l border-white/20">نوع العملية</th>
                <th className="px-3 py-2.5 text-start min-w-64 border-l border-white/20">
                  التفاصيل الدقيقة لما حدث (قبل وبعد التعديل)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    لا توجد أحداث تدقيق مسجلة حتى الآن.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log, i) => {
                  const actorProfile = profiles.find((p) => p.user_id === log.actor_id);
                  const actorName = actorProfile ? actorProfile.display_name : log.actor_id ? "مستخدم" : "النظام";
                  const dt = new Date(log.occurred_at);
                  const timeStr = dt.toLocaleTimeString("ar-YE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

                  return (
                    <tr key={log.id || i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="num px-3 py-2 text-center font-bold text-slate-800">
                        {formatDate(log.occurred_at.slice(0, 10))}
                      </td>
                      <td className="num px-3 py-2 text-center text-slate-500 border-l border-slate-100">
                        {timeStr}
                      </td>
                      <td className="px-3 py-2 font-bold text-brand-900 border-l border-slate-100">
                        {actorName}
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-700 border-l border-slate-100">
                        {log.action}
                      </td>
                      <td className="px-3 py-2 text-slate-600 border-l border-slate-100">
                        <div>
                          {log.reason && <p className="font-bold text-slate-800 mb-0.5">{log.reason}</p>}
                          <details className="text-[11px]">
                            <summary className="cursor-pointer text-blue-600 hover:underline">
                              عرض بيانات التدقيق الدقيقة
                            </summary>
                            <pre className="num mt-1 max-h-36 overflow-auto bg-slate-100 p-2 rounded text-[10px]">
                              {JSON.stringify({ before: log.before_data, after: log.after_data }, null, 2)}
                            </pre>
                          </details>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
