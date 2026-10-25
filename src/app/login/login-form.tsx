"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("بيانات الدخول غير صحيحة أو الحساب غير مفعّل.");
        return;
      }
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مرة أخرى.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" aria-labelledby="login-title">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-800/10 text-brand-800">
            <LockKeyhole size={24} />
          </div>
          <h1 id="login-title" className="text-xl font-bold text-brand-900">
            نظام الخضروات
          </h1>
          <p className="mt-1 text-sm text-slate-600">المشتريات والتوزيع وحسابات الموردين والبقالات</p>
        </div>

        {!isSupabaseConfigured ? (
          <p className="rounded-lg border-gold-500/50 bg-gold-500/10 p-3 text-sm" role="alert">
            لم تُضبط متغيرات البيئة بعد. راجع <code className="num">NEXT_PUBLIC_SUPABASE_URL</code> و
            <code className="num">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border-border-subtle px-3 py-3 text-base"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              كلمة المرور
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border-border-subtle px-3 py-3 text-base"
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-lg bg-danger-600/10 p-3 text-sm text-danger-600">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || !isSupabaseConfigured}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-900 py-3 font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="animate-spin" size={18} /> : null}
            دخول
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          إنشاء الحسابات يتم من المدير فقط. استعادة كلمة المرور تُدار عبر إعدادات مزود الدخول.
        </p>
      </section>
    </main>
  );
}
