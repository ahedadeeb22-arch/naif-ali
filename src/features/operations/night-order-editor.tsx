"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveNightOrderAction } from "@/features/operations/actions";
import { Card } from "@/components/ui/primitives";
import type { ProductRow, StoreRow } from "@/lib/supabase/types";

type OrderLine = { product_id: string; quantity: string; note: string | null };

export function NightOrderEditor({
  date,
  stores,
  products,
  initialLines,
  initialStoreId,
  initialStatus,
}: {
  date: string;
  stores: ReadonlyArray<Pick<StoreRow, "id" | "code" | "name">>;
  products: ReadonlyArray<Pick<ProductRow, "id" | "name" | "sort_order" | "unit_name">>;
  initialLines: OrderLine[];
  initialStoreId: string;
  initialStatus: string | null;
}) {
  const router = useRouter();
  const [storeId, setStoreId] = useState(initialStoreId || stores[0]?.id || "");
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialLines.map((line) => [line.product_id, line.quantity])),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const locked = initialStatus === "submitted" || initialStatus === "cancelled";

  const save = async (submit: boolean) => {
    setBusy(true);
    setNotice("");
    setError("");
    const lines = products.map((product) => ({
      product_id: product.id,
      quantity: quantities[product.id] || "0",
      note: null,
    }));
    const result = await saveNightOrderAction({ date, storeId, lines, submit });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNotice(result.message);
    router.refresh();
  };

  return (
    <Card title="إدخال طلب بقالة">
      {stores.length === 0 || products.length === 0 ? <p className="text-sm text-slate-600">أضف بقالات وأصناف نشطة أولًا.</p> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">البقالة
              <select className="mt-1 w-full rounded-lg border border-border-subtle px-3 py-2.5" value={storeId} onChange={(event) => setStoreId(event.target.value)} disabled={locked}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.code} · {store.name}</option>)}
              </select>
            </label>
            <p className="self-end rounded-lg bg-surface px-3 py-2 text-sm text-slate-600">الطلب منفصل عن الرصيد والقيود المالية.</p>
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <label key={product.id} className="grid grid-cols-[1fr_7rem] items-center gap-2 border-b border-border-subtle py-2 text-sm">
                <span>{product.name}</span>
                <input aria-label={`كمية ${product.name}`} inputMode="decimal" className="num rounded-lg border border-border-subtle px-2 py-2" value={quantities[product.id] ?? ""} placeholder="0" disabled={locked} onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))} />
              </label>
            ))}
          </div>
          {error ? <p role="alert" className="text-sm text-danger-600">{error}</p> : null}
          {notice ? <p role="status" className="text-sm text-green-900">{notice}</p> : null}
          {locked ? <p className="text-sm text-slate-500">هذا الطلب مرسل أو ملغى ولا يمكن تعديله.</p> : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !storeId} onClick={() => save(false)} className="rounded-lg border border-brand-900 px-4 py-2 text-sm font-semibold text-brand-900 disabled:opacity-50">{busy ? "جارٍ الحفظ…" : "حفظ مسودة"}</button>
              <button type="button" disabled={busy || !storeId} onClick={() => save(true)} className="rounded-lg bg-brand-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">إرسال الطلب</button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}