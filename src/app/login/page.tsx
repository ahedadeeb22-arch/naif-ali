import { Suspense } from "react";
import { LoginForm } from "@/app/login/login-form";

export const metadata = { title: "تسجيل الدخول" };

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-brand-900 p-4 text-white">
          <p>جارٍ التحميل…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
