"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reverseVoucherAction } from "@/features/operations/actions";

export function ReverseVoucherButton({ voucherId }: { voucherId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const reverse = async () => {
    const reason = window.prompt("سبب عكس السند:");
    if (!reason?.trim()) return;
    setPending(true);
    const result = await reverseVoucherAction({ voucherId, reason });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };
  return <span className="inline-flex items-center gap-2"><button type="button" disabled={pending} onClick={reverse} className="rounded border border-danger-600 px-2 py-1 text-xs text-danger-600 disabled:opacity-50">{pending ? "جارٍ العكس…" : "عكس"}</button>{message ? <span role="status" className="text-xs">{message}</span> : null}</span>;
}