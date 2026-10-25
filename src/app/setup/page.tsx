import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/config";

export default function SetupPage() {
  const configured = isSupabaseConfigured;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6">
      <div className="rounded-2xl border-border-subtle bg-white p-6">
        <div className="mb-3 flex items-center gap-3 text-brand-900">
          <AlertTriangle />
          <h1 className="text-xl font-bold">إعداد البيئة</h1>
        </div>
        {configured ? (
          <p className="text-sm text-green-900">
            متغيرات Supabase العامة موجودة. <Link className="underline" href="/">تابع إلى النظام</Link>.
          </p>
        ) : (
          <>
            <p className="text-sm leading-7 text-slate-700">
              لم يتم ضبط اتصال Supabase. أنشئ ملف <code className="num">.env.local</code> محليًا (لا يُرفع إلى Git) انطلاقًا من
              <code className="num"> .env.example</code>، ثم شغّل ترحيلات قاعدة البيانات قبل تشغيل التطبيق:
            </p>
            <ol className="mt-3 list-decimal space-y-1 ps-6 text-sm text-slate-700">
              <li>أعد تهيئة/تشغيل Supabase محليًا وطبّق ملفات <code className="num">supabase/migrations</code>.</li>
              <li>نفّذ البيانات المرجعية ثم بيانات الاختبار المعزولة عند الحاجة.</li>
              <li>أضف متغيرات البيئة العامة والسرية ثم أعد تشغيل خادم Next.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">لا تضع أي أسرار حقيقية في المستودع أو في متغيرات NEXT_PUBLIC_*.</p>
          </>
        )}
      </div>
    </main>
  );
}
