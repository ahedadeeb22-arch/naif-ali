/**
 * Config مركزية للتطبيق — لا تُقرأ قيم سرية هنا.
 * القيم العامة فقط (NEXT_PUBLIC_*) وافتراضيات آمنة.
 */

export const APP = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "نظام الخضروات",
  timezone: process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "Asia/Riyadh",
  currency: process.env.NEXT_PUBLIC_CURRENCY ?? "SAR",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
} as const;

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
