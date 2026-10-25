"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { setStoreMembershipAction, updateProfileAction } from "@/features/operations/actions";
import type { AppRole, ProfileRow, StoreMembershipRow, StoreRow } from "@/lib/supabase/types";

function UserRow({ profile, memberships, stores, currentUserId }: { profile: ProfileRow; memberships: StoreMembershipRow[]; stores: StoreRow[]; currentUserId: string }) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name);
  const [role, setRole] = useState<AppRole>(profile.role);
  const [active, setActive] = useState(profile.active);
  const [storeId, setStoreId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const saveProfile = async () => {
    setPending(true);
    const result = await updateProfileAction({ userId: profile.user_id, displayName: name, role, active });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };
  const updateMembership = async (id: string, enabled: boolean) => {
    setPending(true);
    const result = await setStoreMembershipAction({ userId: profile.user_id, storeId: id, active: enabled });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };

  return <tr className="border-b border-border-subtle align-top"><td className="px-2 py-3"><input aria-label="اسم المستخدم" value={name} onChange={(event) => setName(event.target.value)} className="min-w-36 rounded border border-border-subtle px-2 py-1.5" /><p className="num mt-1 max-w-48 truncate text-[10px] text-slate-500">{profile.user_id}</p></td><td className="px-2 py-3"><select aria-label="الدور" value={role} disabled={profile.user_id === currentUserId} onChange={(event) => setRole(event.target.value as AppRole)} className="rounded border border-border-subtle px-2 py-1.5"><option value="admin">مدير</option><option value="worker">عامل</option><option value="store_owner">صاحب بقالة</option></select></td><td className="px-2 py-3"><input type="checkbox" aria-label="الحساب نشط" checked={active} disabled={profile.user_id === currentUserId} onChange={(event) => setActive(event.target.checked)} /></td><td className="px-2 py-3"><div className="flex flex-wrap gap-1">{memberships.filter((membership) => membership.user_id === profile.user_id && membership.active).map((membership) => { const store = stores.find((item) => item.id === membership.store_id); return <button key={membership.store_id} type="button" disabled={pending} onClick={() => updateMembership(membership.store_id, false)} className="rounded border border-border-subtle px-2 py-1 text-xs">{store?.code ?? "بقالة"} ×</button>; })}<select aria-label="إضافة عضوية بقالة" value={storeId} onChange={(event) => setStoreId(event.target.value)} className="max-w-40 rounded border border-border-subtle px-2 py-1 text-xs"><option value="">ربط بقالة</option>{stores.filter((store) => !memberships.some((membership) => membership.user_id === profile.user_id && membership.store_id === store.id && membership.active)).map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}</select>{storeId ? <button type="button" disabled={pending} onClick={() => updateMembership(storeId, true)} className="rounded bg-green-900 px-2 py-1 text-xs text-white">ربط</button> : null}</div></td><td className="px-2 py-3"><button type="button" disabled={pending} onClick={saveProfile} className="rounded bg-brand-900 px-2.5 py-1.5 text-xs text-white disabled:opacity-50">حفظ</button>{message ? <p role="status" className="mt-1 max-w-36 text-[10px]">{message}</p> : null}</td></tr>;
}

export function UserManager({ profiles, memberships, stores, currentUserId }: { profiles: ProfileRow[]; memberships: StoreMembershipRow[]; stores: StoreRow[]; currentUserId: string }) {
  return <div className="space-y-4"><header><h1 className="text-xl font-bold text-brand-900">المستخدمون والصلاحيات</h1><p className="text-sm text-slate-600">تعديل أدوار الحسابات الموجودة وربط أصحاب البقالات. إنشاء حساب Auth يتم من لوحة Supabase.</p></header><Card title={`الحسابات (${profiles.length})`}><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b border-border-subtle bg-surface"><tr><th className="px-2 py-2 text-start">المستخدم</th><th className="px-2 py-2 text-start">الدور</th><th className="px-2 py-2 text-start">نشط</th><th className="px-2 py-2 text-start">عضويات البقالات</th><th className="px-2 py-2 text-start">حفظ</th></tr></thead><tbody>{profiles.map((profile) => <UserRow key={profile.user_id} profile={profile} memberships={memberships} stores={stores} currentUserId={currentUserId} />)}</tbody></table></div></Card></div>;
}