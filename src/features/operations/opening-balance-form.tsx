"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass } from "@/components/ui/primitives";
import { postOpeningBalanceAction } from "@/features/operations/actions";
import { newIdempotencyKey } from "@/lib/rpc";
import type { StoreRow, SupplierRow } from "@/lib/supabase/types";

export function OpeningBalanceForm({ stores, suppliers, date }: { stores: ReadonlyArray<Pick<StoreRow, "id" | "code" | "name">>; suppliers: ReadonlyArray<Pick<SupplierRow, "id" | "name">>; date: string }) {
  const router = useRouter();
  const [partyType, setPartyType] = useState<"store" | "supplier">("store");
  const [partyId, setPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const parties = partyType === "store" ? stores.map((store) => ({ id: store.id, label: `${store.code} · ${store.name}` })) : suppliers.map((supplier) => ({ id: supplier.id, label: supplier.name }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm(`سيتم ترحيل رصيد افتتاحي ${amount} للطرف المحدد بقيد دفتر. هل تتابع؟`)) return;
    setPending(true);
    const key = idempotencyKey || newIdempotencyKey("opening");
    setIdempotencyKey(key);
    try {
      const result = await postOpeningBalanceAction({ partyType, storeId: partyType === "store" ? partyId : null, supplierId: partyType === "supplier" ? partyId : null, amount, date, reason, idempotencyKey: key });
      setMessage(result.message);
      if (result.ok) { setAmount(""); setReason(""); setIdempotencyKey(""); router.refresh(); }
    } catch {
      setMessage("انقطع الرد. أعد المحاولة بنفس البيانات لتجنب تكرار الرصيد.");
    } finally {
      setPending(false);
    }
  };

  return <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <label className="text-sm">نوع الطرف<select value={partyType} onChange={(event) => { setPartyType(event.target.value as typeof partyType); setPartyId(""); setIdempotencyKey(""); }} className={`${inputClass} mt-1`}><option value="store">بقالة</option><option value="supplier">مورد</option></select></label>
    <label className="text-sm">الطرف<select required value={partyId} onChange={(event) => { setPartyId(event.target.value); setIdempotencyKey(""); }} className={`${inputClass} mt-1`}><option value="">اختر الطرف</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.label}</option>)}</select></label>
    <label className="text-sm">المبلغ المستحق<input required inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setIdempotencyKey(""); }} className={`${inputClass} num mt-1`} placeholder="0.00" /></label>
    <label className="text-sm">تاريخ القطع<input required type="date" value={date} readOnly className={`${inputClass} num mt-1`} /></label>
    <label className="text-sm md:col-span-2 xl:col-span-3">سبب/مرجع الرصيد<input required value={reason} onChange={(event) => { setReason(event.target.value); setIdempotencyKey(""); }} className={`${inputClass} mt-1`} /></label>
    <div className="flex flex-wrap items-end gap-3"><button disabled={pending || !partyId} className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "جارٍ الترحيل…" : "ترحيل الرصيد"}</button>{message ? <span role="status" className="text-sm text-slate-600">{message}</span> : null}</div>
  </form>;
}