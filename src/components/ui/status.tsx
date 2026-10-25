import type { ReactNode } from "react";

type Tone = "brand" | "success" | "warn" | "danger" | "muted";

const tones: Record<Tone, string> = {
  brand: "bg-brand-800/10 text-brand-800 border-brand-800/25",
  success: "bg-green-900/10 text-green-900 border-green-900/25",
  warn: "bg-gold-500/15 text-[#7a5300] border-gold-500/40",
  danger: "bg-danger-600/10 text-danger-600 border-danger-600/30",
  muted: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

const statusLabels: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "مسودة", tone: "muted" },
  ready_for_review: { label: "جاهزة للمراجعة", tone: "warn" },
  posted: { label: "معتمدة", tone: "success" },
  closed: { label: "مغلقة", tone: "brand" },
  cancelled: { label: "ملغاة", tone: "danger" },
  superseded: { label: "مستبدلة", tone: "muted" },
  purchased: { label: "مشتري", tone: "success" },
  free_sample: { label: "مجاني", tone: "brand" },
  submitted: { label: "محفوظ", tone: "success" },
  receipt_from_store: { label: "قبض من بقالة", tone: "success" },
  payment_to_supplier: { label: "صرف لمورد", tone: "brand" },
  reversed: { label: "معكوس", tone: "danger" },
};

export function StatusBadge({ status }: { status: string }) {
  const item = statusLabels[status] ?? { label: status, tone: "muted" as Tone };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function Alert({
  tone = "danger",
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${tones[tone]}`}>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 leading-6">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border-dashed border-border-subtle bg-white p-8 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}
