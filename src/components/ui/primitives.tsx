import type { ReactNode } from "react";

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border-subtle bg-white p-4 shadow-sm">
      {title || actions ? (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-base font-bold text-brand-900">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "brand" }: { label: string; value: string; hint?: string; tone?: "brand" | "green" | "gold" | "violet" }) {
  const colors = {
    brand: "border-brand-800/20 bg-brand-800/5 text-brand-900",
    green: "border-green-900/20 bg-green-900/5 text-green-900",
    gold: "border-gold-500/40 bg-gold-500/10 text-[#6b4a00]",
    violet: "border-violet-500/25 bg-violet-500/5 text-brand-800",
  } as const;
  return (
    <div className={`rounded-xl border p-4 ${colors[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="num mt-1 text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs opacity-70">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border-subtle bg-white px-3 py-2.5 text-base focus:border-brand-800";
