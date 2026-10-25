"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeSheetAction } from "@/features/operations/actions";

export function CloseSheetButton({ sheetId, version }: { sheetId: string; version: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const close = async () => {
    if (!window.confirm("إغلاق اليومية يمنع التعديل المعتاد. هل تريد المتابعة؟")) return;
    setPending(true);
    const result = await closeSheetAction({ sheetId, expectedVersion: version });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };
  return <span className="inline-flex items-center gap-2"><button type="button" disabled={pending} onClick={close} className="rounded-lg border border-danger-600 px-3 py-1.5 text-xs font-semibold text-danger-600 disabled:opacity-50">{pending ? "جارٍ الإغلاق…" : "إغلاق"}</button>{message ? <span role="status" className="text-xs">{message}</span> : null}</span>;
}