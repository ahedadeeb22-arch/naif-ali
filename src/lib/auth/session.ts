import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import type { ProfileRow } from "@/lib/supabase/types";

export type AppRole = "admin" | "worker" | "store_owner";

export interface SessionProfile {
  userId: string;
  displayName: string;
  role: AppRole;
  active: boolean;
}

/** يحمّل جلسة موثقة وملف المستخدم من public.profiles. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  // بيئة بلا إعداد (بناء/معاينة) لا تمنح جلسة بدل أن تسقط الصفحة بخطأ 500.
  if (!isSupabaseConfigured) return null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("user_id, display_name, role, active")
    .eq("user_id", user.id)
    .maybeSingle();
  const profile = rawProfile as ProfileRow | null;

  if (!profile || !profile.active) return null;

  return {
    userId: profile.user_id,
    displayName: profile.display_name,
    role: profile.role as AppRole,
    active: profile.active,
  };
}

/** يحمّل الملف ويوقف الطلب دائمًا بإعادة توجيه عند غياب الجلسة. */
export async function requireProfile(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect(isSupabaseConfigured ? "/login" : "/setup");
  return profile;
}

/** صلاحية الدور على الخادم؛ لا نعتمد على إخفاء عناصر الواجهة. */
export async function requireRole(allowed: ReadonlyArray<AppRole>): Promise<SessionProfile> {
  const profile = await requireProfile();
  if (!allowed.includes(profile.role)) {
    throw new Error("FORBIDDEN: لا تملك صلاحية لهذه العملية");
  }
  return profile;
}

export function landingPath(role: AppRole): string {
  if (role === "admin") return "/admin";
  if (role === "worker") return "/worker";
  return "/portal";
}
