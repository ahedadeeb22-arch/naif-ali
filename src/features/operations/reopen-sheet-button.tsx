"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reopenSheetAction } from "@/features/operations/actions";

export function ReopenSheetButton({ sheetId, version }: { sheetId: string; version: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const reopen = async () => {
    const reason = window.prompt("سبب فتح إصدار تصحيح جديد (5 أحرف على الأقل):");
    if (!reason?.trim()) return;
    setPending(true);
    const result = await reopenSheetAction({ sheetId, expectedVersion: version, reason });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };

  return <div className="flex items-center gap-2"><button type="button" disabled={pending} onClick={reopen} className="rounded-lg border border-brand-900 px-3 py-1.5 text-xs font-semibold text-brand-900 disabled:opacity-50">{pending ? "جارٍ الفتح…" : "فتح تصحيح"}</button>{message ? <span role="status" className="text-xs text-slate-600">{message}</span> : null}</div>;
}