"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Moon, Printer, RefreshCw } from "lucide-react";
import { saveBulkNightOrdersAndCreateMorningSheetAction } from "@/features/operations/actions";
import { formatQuantity } from "@/lib/format";
import type { ProductRow, StoreRow } from "@/lib/supabase/types";
import Link from "next/link";

const FRACTIONS = [
  { label: "¼", value: "0.25" },
  { label: "½", value: "0.5" },
  { label: "1.5", value: "1.5" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
];

export function BulkNightOrderMatrix({
  date,
  stores,
  products,
  initialData,
}: {
  date: string;
  stores: ReadonlyArray<Pick<StoreRow, "id" | "code" | "name" | "sort_order">>;
  products: ReadonlyArray<Pick<ProductRow, "id" | "name" | "sort_order" | "unit_name">>;
  initialData: Record<string, Record<string, string>>; // productId -> storeId -> qty
}) {
  const router = useRouter();

  // مصفوفة الكميات: matrix[productId][storeId] = string
  const [matrix, setMatrix] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    for (const p of products) {
      init[p.id] = {};
      for (const s of stores) {
        init[p.id]![s.id] = initialData[p.id]?.[s.id] || "";
      }
    }
    return init;
  });

  // الخلية المحددة حالياً لتطبيق أزرار الكسور السريعة
  const [selectedCell, setSelectedCell] = useState<{ productId: string; storeId: string } | null>(null);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateCell = (productId: string, storeId: string, val: string) => {
    // قبول أرقام أو فراغ أو كسور عشرية
    if (val !== "" && !/^\d*(\.\d{0,3})?$/.test(val)) return;
    setMatrix((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [storeId]: val,
      },
    }));
  };

  const applyFraction = (val: string) => {
    if (!selectedCell) return;
    updateCell(selectedCell.productId, selectedCell.storeId, val);
  };

  // حساب إجمالي كل صنف لحظياً عبر جميع البقالات
  const calculateRowTotal = (productId: string): number => {
    const row = matrix[productId];
    if (!row) return 0;
    let sum = 0;
    for (const s of stores) {
      const q = parseFloat(row[s.id] || "0");
      if (!isNaN(q) && q > 0) sum += q;
    }
    return sum;
  };

  // حساب إجمالي كل بقالة لحظياً
  const calculateStoreTotal = (storeId: string): number => {
    let sum = 0;
    for (const p of products) {
      const q = parseFloat(matrix[p.id]?.[storeId] || "0");
      if (!isNaN(q) && q > 0) sum += q;
    }
    return sum;
  };

  const handleSaveAndCreateMorningSheet = async () => {
    setSaving(true);
    setNotice(null);
    setError(null);

    const payload = stores.map((s) => ({
      storeId: s.id,
      lines: products.map((p) => ({
        product_id: p.id,
        quantity: matrix[p.id]?.[s.id] && matrix[p.id]![s.id]!.trim() !== "" ? matrix[p.id]![s.id]! : "0",
        note: null,
      })),
    }));

    const res = await saveBulkNightOrdersAndCreateMorningSheetAction({
      date,
      orders: payload,
    });

    setSaving(false);
    if (res.ok) {
      setNotice(res.message);
      router.refresh();
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* شريط الإشعارات والحالة */}
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-green-600/30 bg-green-50 p-4 text-green-900 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-green-600 shrink-0" size={20} />
            <span className="text-sm font-bold">{notice}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/reports/pdf/morning-orders?date=${date}`}
              target="_blank"
              className="flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-800"
            >
              <Printer size={14} />
              <span>تنزيل كشف الصباح PDF</span>
            </Link>
            <Link
              href={`/worker/sheets?date=${date}`}
              className="rounded-lg bg-brand-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-800"
            >
              فتح كشف الشراء
            </Link>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-600/30 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}

      {/* شريط الأزرار السريعة للكسور وإدخال الجوال */}
      <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-600">إدخال سريع للخلية المحددة:</span>
          {FRACTIONS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => applyFraction(f.value)}
              disabled={!selectedCell}
              className="h-8 min-w-9 rounded-lg border border-slate-300 bg-slate-50 px-2 text-xs font-black text-brand-900 hover:bg-brand-900 hover:text-white disabled:opacity-40 transition-colors"
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => applyFraction("")}
            disabled={!selectedCell}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            مسح
          </button>
        </div>

        {/* الزر الرئيسي الأهم: حفظ طلبات الليل وإنشاء كشف الصباح */}
        <button
          type="button"
          onClick={handleSaveAndCreateMorningSheet}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-900 to-indigo-900 px-5 py-2.5 text-sm font-black text-white shadow-md hover:opacity-95 disabled:opacity-50 transition-all"
        >
          {saving ? <RefreshCw className="animate-spin" size={18} /> : <Moon size={18} className="text-gold-500" />}
          <span>🌙 حفظ طلبات الليل وإنشاء كشف الصباح</span>
        </button>
      </div>

      {/* جدول إدخال المصفوفة الموحدة الشاملة لجميع البقالات والأصناف */}
      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-white shadow-sm">
        <table className="w-full min-w-[750px] border-collapse text-sm">
          <thead className="bg-slate-50 text-slate-700 text-xs font-bold">
            <tr className="border-b border-border-subtle">
              <th className="sticky right-0 z-10 bg-slate-50 p-3 text-start w-10">م</th>
              <th className="sticky right-10 z-10 bg-slate-50 p-3 text-start min-w-32 border-l border-border-subtle">
                الصنف
              </th>
              {stores.map((s) => (
                <th key={s.id} className="p-3 text-center min-w-20 border-l border-border-subtle">
                  <div className="text-brand-900 font-black text-base">{s.code}</div>
                  <div className="text-[10px] text-slate-500 font-normal truncate max-w-20">{s.name}</div>
                </th>
              ))}
              <th className="p-3 text-center bg-brand-900/5 text-brand-900 font-black min-w-24">
                إجمالي المطلوب
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {products.map((p, pIdx) => {
              const rowTot = calculateRowTotal(p.id);
              const hasQty = rowTot > 0;
              return (
                <tr
                  key={p.id}
                  className={`transition-colors hover:bg-slate-50/70 ${hasQty ? "bg-emerald-50/20" : ""}`}
                >
                  <td className="sticky right-0 z-10 bg-inherit p-3 text-center text-slate-400 num text-xs">
                    {pIdx + 1}
                  </td>
                  <td className="sticky right-10 z-10 bg-inherit p-3 font-bold text-slate-900 border-l border-border-subtle">
                    <div className="flex items-center justify-between">
                      <span>{p.name}</span>
                      <span className="text-[10px] font-normal text-slate-400">{p.unit_name || "سلة"}</span>
                    </div>
                  </td>
                  {stores.map((s) => {
                    const isSelected = selectedCell?.productId === p.id && selectedCell?.storeId === s.id;
                    const val = matrix[p.id]?.[s.id] || "";
                    const numVal = parseFloat(val);
                    const filled = !isNaN(numVal) && numVal > 0;

                    return (
                      <td
                        key={s.id}
                        className={`p-1.5 text-center border-l border-border-subtle ${isSelected ? "ring-2 ring-brand-800 bg-brand-800/5" : ""
                          }`}
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          value={val}
                          onFocus={() => setSelectedCell({ productId: p.id, storeId: s.id })}
                          onChange={(e) => updateCell(p.id, s.id, e.target.value)}
                          className={`num h-11 w-full rounded-lg text-center text-base font-bold transition-all border ${filled
                              ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 font-black shadow-inner"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            } focus:border-brand-900 focus:outline-none`}
                        />
                      </td>
                    );
                  })}
                  <td className="num p-3 text-center font-black text-brand-900 bg-brand-900/5 text-base">
                    {rowTot > 0 ? (
                      <span className="inline-block rounded-lg bg-white px-2 py-1 shadow-sm">
                        {formatQuantity(rowTot)}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900 text-xs">
            <tr>
              <td colSpan={2} className="sticky right-0 z-10 bg-slate-100 p-3 text-center font-black">
                إجمالي سلال البقالة
              </td>
              {stores.map((s) => {
                const sTot = calculateStoreTotal(s.id);
                return (
                  <td key={s.id} className="num p-3 text-center font-black text-brand-900 border-l border-slate-300 text-sm">
                    {sTot > 0 ? formatQuantity(sTot) : "0"}
                  </td>
                );
              })}
              <td className="num p-3 text-center font-black text-emerald-800 bg-brand-900/10 text-base">
                {formatQuantity(
                  products.reduce((acc, p) => acc + calculateRowTotal(p.id), 0)
                )} سلة
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
