import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

/**
 * عميل Supabase للمكونات/الإجراءات الخادمية. يقرأ الجلسة من الكوكيز الموثوقة
 * ولا يستخدم service role إطلاقًا؛ كل الصلاحيات محكومة بـAuth وRLS.
 */
export async function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("إعداد Supabase غير مكتمل: تحقق من متغيرات البيئة العامة");
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const item of items) cookieStore.set(item.name, item.value, item.options);
        } catch {
          // يُستدعى setAll من Server Component أحيانًا؛ middleware يكفل تحديث الجلسة.
        }
      },
    },
  });
}
