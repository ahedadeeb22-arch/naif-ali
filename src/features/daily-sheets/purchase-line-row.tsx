"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { multiplyMoney, parseDecimal, subMoney } from "@/lib/money/decimal";
import { formatAmount } from "@/lib/format";
import { inputClass } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/status";
import { saveDispositionsAction, saveLineAction } from "@/features/daily-sheets/mutations";
import type { SheetLineView } from "@/features/daily-sheets/data";
import type { ProductRow, StoreRow, SupplierRow } from "@/lib/supabase/types";

const QUICK_AMOUNTS = ["0.25", "0.5", "1.5"] as const;
const validNumber = (value: string) => /^\d+(\.\d{1,3})?$/.test(value);
const validPrice = (value: string) => /^\d+(\.\d{1,2})?$/.test(value);

interface DispositionState {
  storeId: string | null;
  quantity: string;
  kind: "store_distribution" | "inventory_remaining" | "damaged";
  reason: string;
}

export function PurchaseLineRow({
  revisionId,
  expectedVersion,
  line,
  products,
  suppliers,
  stores,
  onSaved,
  onError,
  onCancelRequested,
}: {
  revisionId: string;
  expectedVersion: number;
  line: SheetLineView | null;
  products: ReadonlyArray<Pick<ProductRow, "id" | "name" | "sort_order" | "active" | "unit_name">>;
  suppliers: ReadonlyArray<Pick<SupplierRow, "id" | "name" | "active">>;
  stores: ReadonlyArray<Pick<StoreRow, "id" | "code" | "name" | "sort_order" | "active">>;
  onSaved: (_version: number) => void;
  onError: (_message: string) => void;
  onCancelRequested?: (_lineId: string) => void;
}) {
  const [productId, setProductId] = useState(line?.product_id ?? products[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState(line?.supplier_id ?? "");
  const [quantity, setQuantity] = useState(line?.purchased_quantity ?? "");
  const [price, setPrice] = useState(line?.basket_unit_price ?? "");
  const [status, setStatus] = useState<"purchased" | "cancelled" | "free_sample">(
    line?.purchase_status ?? "purchased",
  );
  const [freeReason, setFreeReason] = useState(line?.free_reason ?? "");
  const [savingLine, setSavingLine] = useState(false);
  const [savingDispositions, setSavingDispositions] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [dispositions, setDispositions] = useState<DispositionState[]>(() => {
    if (!line) return [];
    return line.dispositions.map((item) => ({
      storeId: item.store_id,
      quantity: item.quantity,
      kind: (item.disposition_type === "store_distribution" ||
      item.disposition_type === "inventory_remaining" ||
      item.disposition_type === "damaged"
        ? item.disposition_type
        : "inventory_remaining") as DispositionState["kind"],
      reason: item.reason ?? "",
    }));
  });

  const allocated = useMemo(
    () =>
      dispositions.reduce((acc, item) => {
        const value = Number(item.quantity);
        return Number.isFinite(value) ? acc + value : acc;
      }, 0),
    [dispositions],
  );

  const remaining = useMemo(() => {
    if (!validNumber(quantity)) return "—";
    try {
      return subMoney(quantity, allocated.toFixed(3));
    } catch {
      return "—";
    }
  }, [quantity, allocated]);

  const lineValue = useMemo(() => {
    try {
      if (!validPrice(price) || !validNumber(quantity)) return "—";
      return formatAmount(multiplyMoney(quantity, price));
    } catch {
      return "—";
    }
  }, [quantity, price]);

  const saveLine = async () => {
    onError("");
    if (!productId) return onError("اختر الصنف");
    if (!validNumber(quantity)) return onError("أدخل كمية صحيحة حتى 3 منازل عشرية");
    if (status !== "cancelled" && !validPrice(price)) return onError("أدخل سعر السلة حتى منزلتين أو وسم السطر مجانيًا");
    if (status === "free_sample" && !freeReason.trim()) return onError("سبب المجاني مطلوب");

    setSavingLine(true);
    try {
      const result = await saveLineAction({
        revisionId,
        expectedVersion,
        line: {
          id: line?.id,
          product_id: productId,
          supplier_id: status === "cancelled" ? null : supplierId || null,
          purchase_status: status,
          purchased_quantity: quantity,
          basket_unit_price: status === "cancelled" ? null : price,
          note: line?.note ?? null,
          cancellation_reason: null,
          free_reason: status === "free_sample" ? freeReason : null,
        },
      });
      if (!result.ok) return onError(result.error ?? "فشل الحفظ");
      onSaved(result.data?.version ?? expectedVersion + 1);
      setSavedAt(new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setSavingLine(false);
    }
  };

  const saveDispositions = async () => {
    if (!line) return onError("احفظ سطر الشراء أولًا قبل توزيعه");
    onError("");
    for (const item of dispositions) {
      if (!validNumber(item.quantity)) return onError("كمية توزيع غير صالحة");
      if (item.kind === "store_distribution" && !item.storeId) return onError("اختر البقالة لتوزيعها");
      if (item.kind === "damaged" && !item.reason.trim()) return onError("سبب التلف مطلوب");
    }
    const total = Number(allocated.toFixed(3));
    if (validNumber(quantity) && total > Number(quantity) + 0.0005) {
      return onError(`مجموع التوزيع ${total} يتجاوز الكمية ${quantity}`);
    }
    setSavingDispositions(true);
    try {
      const result = await saveDispositionsAction({
        lineId: line.id,
        expectedVersion,
        dispositions: dispositions
          .filter((item) => item.quantity && Number(item.quantity) > 0)
          .map((item) => ({
            disposition_type: item.kind,
            store_id: item.kind === "store_distribution" ? item.storeId : null,
            quantity: item.quantity,
            reason: item.reason || null,
          })),
      });
      if (!result.ok) return onError(result.error ?? "فشل حفظ التوزيع");
      onSaved(result.data?.version ?? expectedVersion + 1);
      setSavedAt(new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setSavingDispositions(false);
    }
  };

  const lineLocked = line?.purchase_status === "cancelled";

  return (
    <tr className="border-b border-border-subtle align-top">
      <td className="sticky-start px-3 py-3">
        <select
          aria-label="الصنف"
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          className={inputClass}
          disabled={lineLocked}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <select
          aria-label="المورد"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
          className={inputClass}
          disabled={lineLocked || status !== "purchased"}
        >
          <option value="">— المورد —</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3">
        <input
          aria-label="الكمية المشتراة"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          className={`${inputClass} num`}
          disabled={lineLocked}
          placeholder="0.000"
        />
        <div className="mt-1 flex-wrap gap-1">
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => {
                if (!validNumber(quantity)) return setQuantity(amount);
                try {
                  const next = parseDecimal(quantity);
                  const added = parseDecimal(amount);
                  const scale = Math.max(next.scale, added.scale);
                  const digits =
                    next.digits * 10n ** BigInt(scale - next.scale) + added.digits * 10n ** BigInt(scale - added.scale);
                  const text = digits.toString().padStart(scale + 1, "0");
                  setQuantity(scale === 0 ? text : `${text.slice(0, text.length - scale)}.${text.slice(-scale)}`);
                } catch {
                  setQuantity(amount);
                }
              }}
              className="rounded border-border-subtle px-2 py-0.5 text-xs hover:bg-surface num"
            >
              +{amount}
            </button>
          ))}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500">سعر السلة</span>
        </div>
        <input
          aria-label="سعر السلة الواحدة"
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className={`${inputClass} num`}
          disabled={lineLocked || status === "free_sample"}
          placeholder="0.00"
        />
        <p className="num mt-1 text-xs text-slate-500">{lineValue}</p>
      </td>
      <td className="px-3 py-3">
        <select
          aria-label="حالة الشراء"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          className={inputClass}
          disabled={lineLocked}
        >
          <option value="purchased">مشتري</option>
          <option value="free_sample">مجاني (سعر صفر)</option>
          <option value="cancelled">ملغى</option>
        </select>
        {status === "free_sample" ? (
          <input
            aria-label="سبب المجاني"
            placeholder="سبب المجاني"
            value={freeReason}
            onChange={(event) => setFreeReason(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        ) : null}
      </td>
      <td className="px-3 py-3">
        <div className="w-56 space-y-1">
          {dispositions.map((item, index) => (
            <div key={index} className="flex items-center gap-1">
              <select
                aria-label="نوع التوزيع"
                value={item.kind}
                onChange={(event) => updateDisposition(index, { kind: event.target.value as DispositionState["kind"] })}
                className="rounded border-border-subtle px-1 py-1 text-xs"
                disabled={lineLocked}
              >
                <option value="store_distribution">بقالة</option>
                <option value="inventory_remaining">مخزون</option>
                <option value="damaged">تالف</option>
              </select>
              {item.kind === "store_distribution" ? (
                <select
                  aria-label="البقالة"
                  value={item.storeId ?? ""}
                  onChange={(event) => updateDisposition(index, { storeId: event.target.value || null })}
                  className="min-w-0 flex-1 rounded border-border-subtle px-1 py-1 text-xs"
                  disabled={lineLocked}
                >
                  <option value="">اختر</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.code} — {store.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                aria-label="كمية التوزيع"
                inputMode="decimal"
                value={item.quantity}
                onChange={(event) => updateDisposition(index, { quantity: event.target.value })}
                className="num w-16 rounded border-border-subtle px-1 py-1 text-xs"
                disabled={lineLocked}
              />
              {item.kind === "damaged" ? (
                <input
                  aria-label="سبب التلف"
                  placeholder="السبب"
                  value={item.reason}
                  onChange={(event) => updateDisposition(index, { reason: event.target.value })}
                  className="w-20 rounded border-border-subtle px-1 py-1 text-xs"
                  disabled={lineLocked}
                />
              ) : null}
              <button
                type="button"
                aria-label="حذف سطر التوزيع"
                onClick={() => setDispositions((prev) => prev.filter((_, i) => i !== index))}
                className="rounded p-1 text-danger-600 hover:bg-danger-600/10"
                disabled={lineLocked}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {!lineLocked ? (
            <button
              type="button"
              onClick={() =>
                setDispositions((prev) => [...prev, { storeId: null, quantity: "", kind: "store_distribution", reason: "" }])
              }
              className="text-xs text-brand-800 hover:underline"
            >
              + إضافة توزيع
            </button>
          ) : null}
          <p className="num text-xs text-slate-600">
            موزع {allocated.toFixed(3)} / متبقٍ {remaining}
          </p>
        </div>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={status} />
        <div className="mt-2 flex-col gap-1">
          <button
            type="button"
            onClick={saveLine}
            disabled={savingLine || lineLocked}
            className="flex items-center justify-center gap-1 rounded-lg bg-brand-900 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {savingLine ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {line ? "تحديث السطر" : "حفظ السطر"}
          </button>
          {line && !lineLocked ? (
            <button
              type="button"
              onClick={saveDispositions}
              disabled={savingDispositions}
              className="rounded-lg border-brand-900 px-2 py-1.5 text-xs font-semibold text-brand-900 disabled:opacity-50"
            >
              {savingDispositions ? "جارٍ حفظ التوزيع…" : "حفظ التوزيع"}
            </button>
          ) : null}
          {line && !lineLocked && onCancelRequested ? (
            <button
              type="button"
              onClick={() => onCancelRequested(line.id)}
              className="rounded-lg border-danger-600 px-2 py-1.5 text-xs font-semibold text-danger-600"
            >
              إلغاء السطر
            </button>
          ) : null}
 {savedAt ? <span className="text-[11px] text-green-900">حُفظ {savedAt}</span> : null}
        </div>
      </td>
    </tr>
  );

  function updateDisposition(index: number, patch: Partial<DispositionState>) {
    setDispositions((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
}
