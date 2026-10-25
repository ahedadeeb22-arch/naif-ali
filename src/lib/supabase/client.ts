"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

let singleton: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** عميل المتصفح: المفتاح العام فقط، والوصول محكوم بـRLS. */
export function createBrowserSupabase() {
  if (singleton) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("إعداد Supabase غير مكتمل في الواجهة");
  }
  singleton = createBrowserClient<Database>(url, anonKey);
  return singleton;
}
