"use client";

import { useState } from "react";
import Link from "next/link";

interface Product {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Store {
  id: string;
  code: string;
  name: string;
}

interface DemoRow {
  product: string;
  quantities: Record<string, string>;
  totalQty: string;
  price: string;
  supplier: string;
  isBought: boolean;
}

const INITIAL_STORES: Store[] = [
  { id: "s1", code: "ص", name: "بقالة الصفا" },
  { id: "s2", code: "ح", name: "بقالة الخير" },
  { id: "s3", code: "س", name: "بقالة السعادة" },
  { id: "s4", code: "ع", name: "بقالة العروبة" },
  { id: "s5", code: "ك", name: "بقالة الكرامة" },
];

const INITIAL_SUPPLIERS: Supplier[] = [
  { id: "sup1", name: "أمين" },
  { id: "sup2", name: "فارس" },
  { id: "sup3", name: "الزعيم" },
  { id: "sup4", name: "صالح اللبيع" },
  { id: "sup5", name: "عمار الخيار" },
];

const INITIAL_ROWS: DemoRow[] = [
  { product: "طماط", quantities: { ص: "", ح: "", س: "", ع: "", ك: "1" }, totalQty: "1", price: "6100", supplier: "أمين", isBought: true },
  { product: "بطاط", quantities: { ص: "", ح: "", س: "", ع: "", ك: "1" }, totalQty: "1", price: "16200", supplier: "أمين", isBought: true },
  { product: "بصل", quantities: { ص: "1", ح: "1", س: "", ع: "", ك: "" }, totalQty: "2", price: "", supplier: "-- لم يتم الشراء --", isBought: false },
  { product: "كوبش", quantities: { ص: "1", ح: "1", س: "", ع: "", ك: "" }, totalQty: "2", price: "1300", supplier: "فارس", isBought: true },
  { product: "جزر", quantities: { ص: "0.5", ح: "0.5", س: "", ع: "", ك: "" }, totalQty: "1", price: "3200", supplier: "الزعيم", isBought: true },
  { product: "بيبار", quantities: { ص: "1", ح: "0.5", س: "", ع: "", ك: "0.5" }, totalQty: "2", price: "2700", supplier: "الزعيم", isBought: true },
  { product: "باميه", quantities: { ص: "0.5", ح: "0.5", س: "0.5", ع: "", ك: "0.5" }, totalQty: "2", price: "2800", supplier: "صالح اللبيع", isBought: true },
  { product: "كوسه", quantities: { ص: "0.5", ح: "0.5", س: "0.5", ع: "", ك: "0.5" }, totalQty: "2", price: "1500", supplier: "صالح اللبيع", isBought: true },
  { product: "اسود", quantities: { ص: "0.5", ح: "0.5", س: "", ع: "", ك: "0.5" }, totalQty: "1.5", price: "800", supplier: "صالح اللبيع", isBought: true },
  { product: "ليم", quantities: { ص: "1", ح: "1", س: "1", ع: "", ك: "1" }, totalQty: "4", price: "3000", supplier: "عمار الخيار", isBought: true },
  { product: "خيار", quantities: { ص: "4", ح: "2", س: "2", ع: "", ك: "2" }, totalQty: "10", price: "1200", supplier: "عمار الخيار", isBought: true },
];

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [rows, setRows] = useState<DemoRow[]>(INITIAL_ROWS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [lastFocused, setLastFocused] = useState<{ rowIndex: number; field: string } | null>(null);
  const [nightSaved, setNightSaved] = useState<boolean>(true);
  const [isManagerEdit, setIsManagerEdit] = useState<boolean>(false);
  const [selectedDayReport, setSelectedDayReport] = useState<string>("الجمعة (16/10/2026م)");

  // صلاحيات العامل في وضع العرض
  const [permAddSupplier, setPermAddSupplier] = useState(true);
  const [permAddProduct, setPermAddProduct] = useState(true);
  const [permEditQty, setPermEditQty] = useState(true);

  // إدخال كسر
  const insertFraction = (frac: string) => {
    if (!lastFocused) {
      alert("اضغط أولاً داخل خانة البقالة التي تريد كتابة الكسر فيها.");
      return;
    }
    const { rowIndex, field } = lastFocused;
    setRows((prev) => {
      const next = [...prev];
      const target = { ...next[rowIndex]!, quantities: { ...next[rowIndex]!.quantities } };
      if (field === "totalQty") {
        target.totalQty = frac;
      } else {
        target.quantities[field] = frac;
        let sum = 0;
        INITIAL_STORES.forEach((s) => {
          sum += parseFloat(target.quantities[s.code] || "0") || 0;
        });
        target.totalQty = sum > 0 ? String(sum) : "";
      }
      next[rowIndex] = target;
      return next;
    });
  };

  // تكرار سطر
  const duplicateRow = (index: number) => {
    const original = rows[index]!;
    const clone: DemoRow = {
      product: original.product,
      quantities: { ص: "", ح: "", س: "", ع: "", ك: "" },
      totalQty: "",
      price: "",
      supplier: suppliers[0]?.name || "",
      isBought: false,
    };
    setRows((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  // إضافة صنف جديد
  const promptAddProduct = () => {
    const name = window.prompt("أدخل اسم صنف الخضار الجديد:");
    if (!name || !name.trim()) return;
    setRows((prev) => [
      ...prev,
      {
        product: name.trim(),
        quantities: { ص: "", ح: "", س: "", ع: "", ك: "" },
        totalQty: "",
        price: "",
        supplier: suppliers[0]?.name || "",
        isBought: false,
      },
    ]);
  };

  // إضافة مورد جديد
  const promptAddSupplier = () => {
    const name = window.prompt("أدخل اسم المورد الجديد:");
    if (!name || !name.trim()) return;
    setSuppliers((prev) => [...prev, { id: `sup-${Date.now()}`, name: name.trim() }]);
    alert(`تمت إضافة المورد (${name.trim()}) بنجاح!`);
  };

  // حساب الإجماليات
  const storeSums: Record<string, number> = { ص: 0, ح: 0, س: 0, ع: 0, ك: 0 };
  let grandTotal = 0;

  rows.forEach((r) => {
    const price = parseFloat(r.price) || 0;
    const totalQ = parseFloat(r.totalQty) || 0;
    if (price > 0) {
      INITIAL_STORES.forEach((s) => {
        const q = parseFloat(r.quantities[s.code] || "0") || 0;
        storeSums[s.code] = (storeSums[s.code] || 0) + q * price;
      });
      grandTotal += totalQ * price;
    }
  });

  const boughtCount = rows.filter((r) => r.isBought && parseFloat(r.totalQty) > 0).length;
  const activeItemsCount = rows.filter((r) => parseFloat(r.totalQty) > 0).length;

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-[#1e272e] dir-rtl" dir="rtl">
      {/* شريط تنبيه وضع المعاينة التجريبية المعزول الصارم */}
      <div className="bg-amber-500 text-slate-950 p-3 px-4 font-black text-xs sm:text-sm text-center shadow-md flex items-center justify-between gap-2 flex-wrap border-b-2 border-amber-600">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <span>
            وضع المعاينة التجريبية المعزول (Demo Mode): هذه بيانات عرض تجريبية معزولة في الذاكرة (من ملف gemini-code-1792530254546.html) ولا تؤثر على قاعدة بيانات Supabase الحقيقية.
          </span>
        </div>
        <Link
          href="/login"
          className="bg-[#0c2461] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-[#1e3799] transition shadow-xs"
        >
          🚀 الانتقال لنظام الإنتاج (Supabase Login)
        </Link>
      </div>

      {/* شريط التنقل العلوي بين الشاشات الخمس (نفس تصميم الملف المرفق) */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-[#0c2461] to-[#1e3799] text-white p-3 px-4 flex flex-wrap items-center justify-between gap-2 shadow-lg">
        <div className="font-bold text-[#f6b93b] text-sm flex items-center gap-2">
          <span>👑</span>
          <span>النظام المحاسبي المتكامل (النموذج التفاعلي المرجعي):</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => { setActiveTab(1); setIsManagerEdit(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 1
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 hover:bg-white/20 text-white"
              }`}
          >
            1. واجهة العامل (الكشف اليومي + الطلبات)
          </button>
          <button
            onClick={() => setActiveTab(2)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 2
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 hover:bg-white/20 text-white"
              }`}
          >
            🌟 2. تقارير الأيام المنفردة والتعديل الشامل
          </button>
          <button
            onClick={() => setActiveTab(3)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 3
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 hover:bg-white/20 text-white"
              }`}
          >
            3. لوحة المدير (كشوفات البقالات والموردين)
          </button>
          <button
            onClick={() => setActiveTab(4)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 4
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 hover:bg-white/20 text-white"
              }`}
          >
            4. لوحة المدير (الصلاحيات والتدقيق)
          </button>
          <button
            onClick={() => setActiveTab(5)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 5
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 hover:bg-white/20 text-white"
              }`}
          >
            5. واجهة صاحب البقالة (قراءة فقط)
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-4 space-y-5">
        {/* ======================================================== */}
        {/* الشاشة 1: واجهة العامل والكشف اليومي الموحد */}
        {/* ======================================================== */}
        {activeTab === 1 && (
          <div className="space-y-4">
            {/* شريط التعديل الشامل للمدير إن كان قادماً من الشاشة 2 */}
            {isManagerEdit && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#8e44ad] p-4 text-white shadow-md border-r-8 border-[#f6b93b]">
                <div>
                  <h3 className="font-black text-sm">
                    🔓 وضع التعديل الشامل للمدير مفعل الآن على كشف:{" "}
                    <span className="text-[#ffeaa7] underline">{selectedDayReport}</span>
                  </h3>
                  <p className="mt-1 text-xs text-purple-100">
                    يمكنك تعديل كميات البقالات، أو زيادة العدد الإجمالي (شراء إضافي)، أو تعديل السعر والمورد، وسيتم الترحيل بنفس التاريخ.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      alert("تم حفظ التعديل وإعادة الترحيل المحاسبي بنفس التاريخ بنجاح!");
                      setIsManagerEdit(false);
                      setActiveTab(2);
                    }}
                    className="rounded-xl bg-[#f6b93b] text-[#0c2461] px-3.5 py-1.5 text-xs font-black shadow-xs hover:bg-[#e6a827]"
                  >
                    💾 حفظ التعديل وإعادة الترحيل بنفس التاريخ
                  </button>
                  <button
                    onClick={() => { setIsManagerEdit(false); setActiveTab(2); }}
                    className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    ↩️ العودة لصفحة التقارير
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl border-t-4 border-t-[#009432] bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-black text-[#006266]">
                    📋 شاشة الكشف اليومي الموحد (إدخال طلبات الليل وشراء الصباح)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    اليوم: <strong className="text-[#0c2461]">الجمعة</strong> | التاريخ الثابت للكشف:{" "}
                    <strong className="text-[#EA2027]">16 / 10 / 2026م</strong> | الوضع الحالي:{" "}
                    <strong>{isManagerEdit ? "المدير العام (وضع التعديل)" : "العامل (أحمد)"}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {permAddProduct && (
                    <button
                      onClick={promptAddProduct}
                      className="rounded-xl bg-[#0652DD] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0542b3]"
                    >
                      ➕ إضافة صنف جديد
                    </button>
                  )}
                  {permAddSupplier && (
                    <button
                      onClick={promptAddSupplier}
                      className="rounded-xl bg-[#009432] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#007d2a]"
                    >
                      ➕ إضافة مورد جديد
                    </button>
                  )}
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
                    حالة الكشف: مفتوح للتعديل والشراء
                  </span>
                </div>
              </div>

              {/* شريط الكسور السريعة وعداد الإنجاز */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-100 p-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-slate-700">⚡ أزرار الكسور السريعة:</span>
                  <button onClick={() => insertFraction("0.5")} className="rounded-lg bg-white border border-[#006266] text-[#006266] px-2.5 py-1 text-xs font-bold hover:bg-[#006266] hover:text-white">
                    ½ (0.5)
                  </button>
                  <button onClick={() => insertFraction("0.25")} className="rounded-lg bg-white border border-[#006266] text-[#006266] px-2.5 py-1 text-xs font-bold hover:bg-[#006266] hover:text-white">
                    ¼ (0.25)
                  </button>
                  <button onClick={() => insertFraction("1.5")} className="rounded-lg bg-white border border-[#006266] text-[#006266] px-2.5 py-1 text-xs font-bold hover:bg-[#006266] hover:text-white">
                    1.5
                  </button>
                </div>
                <div className="rounded-full bg-white px-3.5 py-1 text-xs font-black text-[#006266] border border-slate-300">
                  🛒 إنجاز الشراء الصباحي: تم شراء {boughtCount} من {activeItemsCount} أصناف مطلوبة
                </div>
              </div>

              {/* جدول الكشف اليومي الموحد */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[1000px] border-collapse text-xs">
                  <thead className="bg-[#006266] text-white font-bold border-b border-[#004d4f]">
                    <tr>
                      {INITIAL_STORES.map((s) => (
                        <th key={s.id} className="p-2.5 text-center min-w-16 border-l border-[#004d4f]">
                          <div className="font-black text-sm text-[#f6b93b]">{s.code}</div>
                          <div className="text-[10px] text-white/80">{s.name}</div>
                        </th>
                      ))}
                      <th className="p-2.5 text-center bg-[#0c2461] text-white font-black min-w-28 border-l border-[#004d4f]">
                        العدد (المشترى)
                      </th>
                      <th className="sticky right-0 z-10 bg-[#006266] p-2.5 text-start min-w-36 border-l border-[#004d4f]">
                        الصنف (+)
                      </th>
                      <th className="p-2.5 text-center min-w-24 border-l border-[#004d4f]">
                        السعر 1 (للسلة)
                      </th>
                      <th className="p-2.5 text-center min-w-32 border-l border-[#004d4f]">المورد</th>
                      <th className="p-2.5 text-center min-w-28 bg-[#009432]">تأكيد الشراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rows.map((row, idx) => {
                      const isPriceSet = parseFloat(row.price) > 0;
                      const isBought = row.isBought && isPriceSet;
                      const sumDist = INITIAL_STORES.reduce(
                        (acc, s) => acc + (parseFloat(row.quantities[s.code] || "0") || 0),
                        0
                      );
                      const purQ = parseFloat(row.totalQty || "0") || 0;
                      const variance = purQ - sumDist;

                      return (
                        <tr
                          key={idx}
                          className={
                            isBought
                              ? "bg-[#e8f8f5] hover:bg-[#d8f3ec]"
                              : !isPriceSet && purQ > 0
                                ? "bg-[#fff5f5] hover:bg-[#ffebeb]"
                                : idx % 2 === 0
                                  ? "bg-white"
                                  : "bg-slate-50/50"
                          }
                        >
                          {INITIAL_STORES.map((s) => (
                            <td key={s.id} className="p-1.5 text-center border-l border-slate-200">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.quantities[s.code] || ""}
                                onFocus={() => setLastFocused({ rowIndex: idx, field: s.code })}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRows((prev) => {
                                    const next = [...prev];
                                    const target = { ...next[idx]!, quantities: { ...next[idx]!.quantities } };
                                    target.quantities[s.code] = val;
                                    let sum = 0;
                                    INITIAL_STORES.forEach((st) => {
                                      sum += parseFloat(target.quantities[st.code] || "0") || 0;
                                    });
                                    target.totalQty = sum > 0 ? String(sum) : "";
                                    next[idx] = target;
                                    return next;
                                  });
                                }}
                                className={`w-14 h-8 rounded text-center text-xs font-bold border ${parseFloat(row.quantities[s.code] || "0") > 0
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-950 font-black"
                                    : "border-slate-300 bg-white text-slate-800"
                                  }`}
                              />
                            </td>
                          ))}

                          {/* العدد الإجمالي المشترى مع مؤشر الفوارق */}
                          <td className="p-1.5 text-center bg-blue-50/30 border-l border-slate-200">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.totalQty}
                              onFocus={() => setLastFocused({ rowIndex: idx, field: "totalQty" })}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRows((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx]!, totalQty: val };
                                  return next;
                                });
                              }}
                              className="w-16 h-8 rounded text-center text-xs font-black border border-slate-400 bg-white text-[#0c2461]"
                            />
                            {purQ > 0 && (
                              <div className="mt-0.5">
                                {variance > 0 ? (
                                  <span className="text-[10px] bg-amber-100 text-amber-800 rounded px-1 font-bold">
                                    +{variance} غير موزع
                                  </span>
                                ) : variance < 0 ? (
                                  <span className="text-[10px] bg-rose-100 text-rose-800 rounded px-1 font-bold">
                                    {variance} عجز
                                  </span>
                                ) : (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-800 rounded px-1 font-bold">
                                    موزع ✅
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* الصنف مع زر (+) للتكرار لمورد ثانٍ */}
                          <td className="sticky right-0 z-10 bg-inherit p-2 font-black text-slate-900 border-l border-slate-200">
                            <div className="flex items-center justify-between gap-1">
                              <span>{row.product}</span>
                              <button
                                type="button"
                                onClick={() => duplicateRow(idx)}
                                title="شراء من مورد آخر بسعر مختلف (+)"
                                className="h-6 w-6 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white flex items-center justify-center font-bold text-xs"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          {/* السعر */}
                          <td className="p-1.5 text-center border-l border-slate-200">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={row.price}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRows((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx]!, price: val };
                                  return next;
                                });
                              }}
                              className={`w-20 h-8 rounded text-center text-xs font-bold border ${isPriceSet ? "bg-amber-50 border-amber-300 text-slate-900" : "bg-white border-slate-300 text-slate-400"
                                }`}
                            />
                          </td>

                          {/* المورد */}
                          <td className="p-1.5 text-center border-l border-slate-200">
                            <select
                              value={row.supplier}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRows((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx]!, supplier: val };
                                  return next;
                                });
                              }}
                              className="h-8 w-full rounded border border-slate-300 bg-white px-1 text-xs font-bold text-slate-800"
                            >
                              <option>-- لم يتم الشراء --</option>
                              {suppliers.map((sup) => (
                                <option key={sup.id} value={sup.name}>
                                  {sup.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* تأكيد الشراء */}
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setRows((prev) => {
                                  const next = [...prev];
                                  next[idx] = { ...next[idx]!, isBought: !next[idx]!.isBought };
                                  return next;
                                });
                              }}
                              className={`w-28 py-1.5 rounded-full text-xs font-black transition-all ${row.isBought
                                  ? "bg-[#009432] text-white shadow-xs"
                                  : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                }`}
                            >
                              {row.isBought ? "تم الشراء ✅" : "⏳ قيد الشراء"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* تذييل الإجماليات وأزرار حفظ الليل والترحيل */}
                  <tfoot className="bg-[#ffeaa7] text-slate-900 border-t-2 border-[#fdcb6e]">
                    <tr>
                      {INITIAL_STORES.map((s) => (
                        <td key={s.id} className="p-2.5 text-center font-black text-xs border-l border-[#fdcb6e]">
                          <div>{storeSums[s.code]?.toLocaleString()} ر.ي</div>
                          <div className="text-[10px] text-slate-600 font-normal">إجمالي {s.code}</div>
                        </td>
                      ))}
                      <td className="p-2.5 text-center bg-[#f6b93b] text-[#0c2461] font-black text-sm border-l border-[#fdcb6e]">
                        <div>{grandTotal.toLocaleString()} ر.ي</div>
                        <div className="text-[10px] font-bold">إجمالي المشتريات</div>
                      </td>
                      <td className="p-2.5 text-start font-black text-xs border-l border-[#fdcb6e]">
                        الإجمالي اليومي
                      </td>
                      <td colSpan={3} className="p-2.5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setNightSaved(true);
                              alert("تم حفظ طلبات الليل وتوليد الجدول السفلي وبطاقات الفرز بنجاح!");
                              const el = document.getElementById("demo-saved-orders-card");
                              if (el) el.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 shadow-xs"
                          >
                            🌙 1. حفظ طلبات الليل (تثبيت وإنشاء الجدول السفلي)
                          </button>
                          <button
                            onClick={() => {
                              alert("تم حفظ الشراء وترحيل الحسابات إلى دفتر الأستاذ بنجاح!");
                            }}
                            className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 shadow-xs"
                          >
                            💾 2. حفظ الشراء وترحيل الحسابات
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* الجدول السفلي المحفوظ لطلبات البقالات وبطاقات الفرز */}
            <div id="demo-saved-orders-card" className="rounded-2xl border-t-4 border-t-[#0984e3] bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-black text-[#0984e3]">
                    📌 ثانياً: جدول طلبات البقالات المحفوظ من الليل (كل بقالة ماذا تريد فقط)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    يُنشأ هذا الجدول تلقائياً ليحتفظ بالبيانات ثابتة أمام العامل عند الشراء في الصباح دون تشتت بالأسعار والموردين.
                  </p>
                </div>
                <span className="rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-xs font-black border border-blue-200">
                  {nightSaved ? "محفوظ ومثبت للصباح ✅" : "قيد الإدخال ⏳"}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-blue-200">
                <table className="w-full min-w-[700px] border-collapse text-xs">
                  <thead className="bg-[#0984e3] text-white font-bold">
                    <tr>
                      <th className="p-2.5 text-start min-w-32">الصنف المطلوب</th>
                      {INITIAL_STORES.map((s) => (
                        <th key={s.id} className="p-2.5 text-center min-w-16 border-l border-white/20">
                          طلب بقالة ({s.code})
                        </th>
                      ))}
                      <th className="p-2.5 text-center bg-[#0c2461] text-white font-black min-w-28 border-l border-white/20">
                        إجمالي المطلوب صباحاً
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rows.map((row, idx) => {
                      const sumQ = INITIAL_STORES.reduce((acc, s) => acc + (parseFloat(row.quantities[s.code] || "0") || 0), 0);
                      if (sumQ === 0) return null;
                      return (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-blue-50/20"}>
                          <td className="p-2.5 font-black text-slate-900">{row.product}</td>
                          {INITIAL_STORES.map((s) => {
                            const val = row.quantities[s.code];
                            return (
                              <td key={s.id} className="p-2.5 text-center border-l border-slate-100 font-bold">
                                {val && parseFloat(val) > 0 ? val : "—"}
                              </td>
                            );
                          })}
                          <td className="p-2.5 text-center font-black bg-[#e8f8f5] text-[#006266] text-sm border-l border-slate-100">
                            {sumQ} سلة
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* بطاقات الفرز السريع للسيارات */}
              <div>
                <h3 className="mb-2 text-xs font-black text-[#0c2461]">
                  📦 بطاقات الفرز السريع للسيارات (كل بقالة ماذا تريد بالتفصيل):
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {INITIAL_STORES.map((s) => {
                    const items = rows.filter((r) => parseFloat(r.quantities[s.code] || "0") > 0);
                    return (
                      <div key={s.id} className="rounded-xl border border-slate-200 border-t-4 border-t-[#0984e3] p-3 bg-white shadow-xs space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <span className="font-black text-xs text-[#0c2461]">
                            🏪 {s.code} · {s.name}
                          </span>
                          <span className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                            {items.length} أصناف
                          </span>
                        </div>
                        {items.length === 0 ? (
                          <p className="text-[11px] text-slate-400 py-2">لا توجد طلبات مسجلة</p>
                        ) : (
                          <ul className="text-[11px] space-y-1">
                            {items.map((it, i) => (
                              <li key={i} className="flex justify-between py-0.5 border-b border-slate-50 last:border-0">
                                <span className="text-slate-700">{it.product}:</span>
                                <strong className="text-slate-900">{it.quantities[s.code]}</strong>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* الشاشة 2: تقارير الأيام والتعديل الشامل للمدير */}
        {/* ======================================================== */}
        {activeTab === 2 && (
          <div className="rounded-2xl border-t-4 border-t-[#6c5ce7] bg-white p-5 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-[#6c5ce7]">
                  📊 صفحة تقارير الأيام المنفردة وكشف الحساب اليومي (مع التعديل الشامل 100%)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  يستعرض المدير تقارير كافة الأيام، ويعرض كشف اليوم أو يضغط (تعديل شامل) لينقله لواجهة الكشف اليومي لتعديله وترحيله بنفس تاريخه.
                </p>
              </div>
              <span className="rounded-full bg-purple-100 text-[#6c5ce7] px-3 py-1 text-xs font-black border border-purple-200">
                صلاحية المدير المطلقة: 100%
              </span>
            </div>

            {/* كروت أرشيف أيام الأسبوع */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border-2 border-[#6c5ce7] bg-purple-50/20 p-4 shadow-xs space-y-3">
                <div className="flex justify-between items-center font-bold text-sm">
                  <span className="text-slate-900">📅 يوم الجمعة</span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs">
                    16 / 10 / 2026م
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  إجمالي مشتريات اليوم: <strong className="text-emerald-700">64,000 ريال</strong><br />
                  الأصناف المشتراة: <strong>10 أصناف</strong>
                </div>
                <div className="flex gap-2 pt-2 border-t border-purple-100">
                  <button
                    onClick={() => setSelectedDayReport("الجمعة (16/10/2026م)")}
                    className="flex-1 rounded-lg bg-blue-600 text-white py-1.5 text-xs font-bold hover:bg-blue-700"
                  >
                    📄 تقرير الكشف
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDayReport("الجمعة (16/10/2026م)");
                      setIsManagerEdit(true);
                      setActiveTab(1);
                    }}
                    className="flex-1 rounded-lg bg-[#6c5ce7] text-white py-1.5 text-xs font-bold hover:bg-[#5848d1]"
                  >
                    ✏️ تعديل شامل
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                <div className="flex justify-between items-center font-bold text-sm">
                  <span className="text-slate-900">📅 يوم الخميس</span>
                  <span className="rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs">
                    15 / 10 / 2026م
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  إجمالي مشتريات اليوم: <strong className="text-slate-900">58,200 ريال</strong><br />
                  الأصناف المشتراة: <strong>9 أصناف</strong>
                </div>
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedDayReport("الخميس (15/10/2026م)")}
                    className="flex-1 rounded-lg bg-blue-600 text-white py-1.5 text-xs font-bold hover:bg-blue-700"
                  >
                    📄 تقرير الكشف
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDayReport("الخميس (15/10/2026م)");
                      setIsManagerEdit(true);
                      setActiveTab(1);
                    }}
                    className="flex-1 rounded-lg bg-[#6c5ce7] text-white py-1.5 text-xs font-bold hover:bg-[#5848d1]"
                  >
                    ✏️ تعديل شامل
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                <div className="flex justify-between items-center font-bold text-sm">
                  <span className="text-slate-900">📅 يوم الأربعاء</span>
                  <span className="rounded-full bg-purple-100 text-purple-800 px-2 py-0.5 text-xs">
                    14 / 10 / 2026م
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  إجمالي مشتريات اليوم: <strong className="text-slate-900">61,000 ريال</strong><br />
                  الأصناف المشتراة: <strong>11 صنف</strong>
                </div>
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedDayReport("الأربعاء (14/10/2026م)")}
                    className="flex-1 rounded-lg bg-blue-600 text-white py-1.5 text-xs font-bold hover:bg-blue-700"
                  >
                    📄 تقرير الكشف
                  </button>
                  <button
                    onClick={() => {
                      setSelectedDayReport("الأربعاء (14/10/2026م)");
                      setIsManagerEdit(true);
                      setActiveTab(1);
                    }}
                    className="flex-1 rounded-lg bg-[#6c5ce7] text-white py-1.5 text-xs font-bold hover:bg-[#5848d1]"
                  >
                    ✏️ تعديل شامل
                  </button>
                </div>
              </div>
            </div>

            {/* عرض كشف الحساب المنفرد لليوم المحدد */}
            <div className="rounded-2xl border-2 border-[#6c5ce7] bg-[#fbfaff] p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-200 pb-3">
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    📑 كشف حساب وتقرير يوم: <span className="text-[#6c5ce7]">{selectedDayReport}</span>
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    يعرض ملخص ما تم شراؤه وتوزيعه. لتعديل أي رقم أو إضافة مشتريات، اضغط زر (تعديل شامل).
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsManagerEdit(true); setActiveTab(1); }}
                    className="rounded-xl bg-[#6c5ce7] hover:bg-[#5848d1] text-white px-3.5 py-1.5 text-xs font-black shadow-xs"
                  >
                    ✏️ فتح هذا اليوم في واجهة الكشف لتعديله بالكامل
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 text-xs font-bold"
                  >
                    🖨️ طباعة كشف اليوم
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-purple-200 bg-white">
                <table className="w-full min-w-[800px] border-collapse text-xs">
                  <thead className="bg-[#6c5ce7] text-white font-bold">
                    <tr>
                      <th className="p-2 text-start">الصنف</th>
                      {INITIAL_STORES.map((s) => (
                        <th key={s.id} className="p-2 text-center border-l border-white/20">
                          {s.code} ({s.name})
                        </th>
                      ))}
                      <th className="p-2 text-center bg-[#2f3542] text-white font-black border-l border-white/20">
                        العدد المشترى
                      </th>
                      <th className="p-2 text-center border-l border-white/20">السعر</th>
                      <th className="p-2 text-center border-l border-white/20">المورد</th>
                      <th className="p-2 text-center border-l border-white/20 font-black">إجمالي الصنف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-100">
                    {rows.map((row, idx) => {
                      const price = parseFloat(row.price) || 0;
                      const q = parseFloat(row.totalQty) || 0;
                      const total = price * q;
                      return (
                        <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-purple-50/20"}>
                          <td className="p-2 font-black text-slate-900">{row.product}</td>
                          {INITIAL_STORES.map((s) => (
                            <td key={s.id} className="p-2 text-center border-l border-slate-100">
                              {row.quantities[s.code] || "—"}
                            </td>
                          ))}
                          <td className="p-2 text-center font-black text-[#0c2461] border-l border-slate-100">
                            {q}
                          </td>
                          <td className="p-2 text-center font-bold text-slate-800 border-l border-slate-100">
                            {price > 0 ? price.toLocaleString() : "—"}
                          </td>
                          <td className="p-2 text-center text-slate-700 border-l border-slate-100">
                            {row.supplier}
                          </td>
                          <td className="p-2 text-center font-black text-emerald-800 bg-emerald-50/40 border-l border-slate-100">
                            {total > 0 ? `${total.toLocaleString()} ر.ي` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* الشاشة 3: لوحة المدير - كشوفات البقالات والموردين */}
        {/* ======================================================== */}
        {activeTab === 3 && (
          <div className="space-y-5">
            {/* البطاقات الأربع العلوية */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-2xl border-r-6 border-r-emerald-600 border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-slate-500 font-bold mb-1">إجمالي مشتريات اليوم (الجمعة)</div>
                <div className="text-2xl font-black text-emerald-700">64,000 ريال</div>
              </div>
              <div className="rounded-2xl border-r-6 border-r-[#e58e26] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-slate-500 font-bold mb-1">إجمالي الديون التي علينا للموردين</div>
                <div className="text-2xl font-black text-[#e58e26]">145,000 ريال</div>
              </div>
              <div className="rounded-2xl border-r-6 border-r-[#0652DD] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs text-slate-500 font-bold mb-1">إجمالي الديون المطلوبة من البقالات</div>
                <div className="text-2xl font-black text-[#0652DD]">210,500 ريال</div>
              </div>
              <div className="rounded-2xl border-r-6 border-r-[#EA2027] border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
                <div className="text-xs text-slate-500 font-bold mb-1">حالة كشف اليومية الحالي</div>
                <button
                  onClick={() => alert("تم اعتماد وإغلاق يومية الجمعة بنجاح!")}
                  className="rounded-xl bg-slate-900 text-white py-1.5 px-3 text-xs font-bold hover:bg-slate-800"
                >
                  🔒 إغلاق واعتماد يومية الجمعة
                </button>
              </div>
            </div>

            {/* كشف حساب مورد مفصل */}
            <div className="rounded-2xl border-t-5 border-t-[#e58e26] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-[#b33939]">
                  🚚 أولاً: شاشة كشف حساب مورد مفصل (تحديد بالتاريخ)
                </h3>
                <button
                  onClick={() => alert("تفتح نافذة تسجيل سند سداد للمورد ويخصم من رصيده فوراً")}
                  className="rounded-xl bg-[#e58e26] text-white px-3.5 py-1.5 text-xs font-black hover:bg-[#d07e1c]"
                >
                  💵 + تسجيل سند سداد للمورد
                </button>
              </div>

              <table className="w-full min-w-[700px] border-collapse text-xs rounded-xl overflow-hidden border border-slate-200">
                <thead className="bg-[#b33939] text-white font-bold">
                  <tr>
                    <th className="p-2.5 text-center">التاريخ</th>
                    <th className="p-2.5 text-start border-l border-white/20">البيان / العملية</th>
                    <th className="p-2.5 text-start border-l border-white/20">تفاصيل الأصناف المأخوذة</th>
                    <th className="p-2.5 text-center border-l border-white/20">قيمة المشتريات (بالآجل)</th>
                    <th className="p-2.5 text-center border-l border-white/20">المسدد للمورد</th>
                    <th className="p-2.5 text-center border-l border-white/20">الرصيد المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="p-2.5 text-center font-bold">15/10/2026</td>
                    <td className="p-2.5 font-semibold">مشتريات الخميس</td>
                    <td className="p-2.5 text-slate-700">• باميه: (3) × 2,500 = 7,500 | • كوسه: (2) × 1,500 = 3,000</td>
                    <td className="p-2.5 text-center font-bold">10,500</td>
                    <td className="p-2.5 text-center">0</td>
                    <td className="p-2.5 text-center font-black">10,500</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 text-center font-bold">16/10/2026</td>
                    <td className="p-2.5 font-semibold">مشتريات الجمعة</td>
                    <td className="p-2.5 text-slate-700">• باميه: (2) × 2,800 = 5,600 | • كوسه: (2) × 1,500 = 3,000 | • اسود: (1.5) × 800 = 1,200</td>
                    <td className="p-2.5 text-center font-bold">9,800</td>
                    <td className="p-2.5 text-center">0</td>
                    <td className="p-2.5 text-center font-black">20,300</td>
                  </tr>
                  <tr className="bg-emerald-50">
                    <td className="p-2.5 text-center font-bold">16/10/2026</td>
                    <td className="p-2.5 font-bold text-emerald-800">سند سداد نقدي #32</td>
                    <td className="p-2.5 text-emerald-900 font-semibold">دفعة سداد نقدية من الإدارة للمورد (صالح اللبيع)</td>
                    <td className="p-2.5 text-center">—</td>
                    <td className="p-2.5 text-center font-black text-emerald-700">15,000</td>
                    <td className="p-2.5 text-center font-black">5,300</td>
                  </tr>
                </tbody>
                <tfoot className="bg-[#ffeaa7] text-slate-900 font-bold border-t-2 border-[#fdcb6e]">
                  <tr>
                    <td colSpan={3} className="p-2.5 text-start font-black">
                      الإجمالي النهائي لحساب المورد (صالح اللبيع)
                    </td>
                    <td className="p-2.5 text-center font-black">20,300 ريال</td>
                    <td className="p-2.5 text-center font-black text-emerald-800">15,000 ريال</td>
                    <td className="p-2.5 text-center font-black text-[#EA2027]">المتبقي له: 5,300 ريال</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* كشف حساب بقالة مفصل */}
            <div className="rounded-2xl border-t-5 border-t-[#0652DD] border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-[#0652DD]">
                  🏪 ثانياً: شاشة كشف حساب بقالة مفصل (تحديد بالتاريخ)
                </h3>
                <button
                  onClick={() => alert("تفتح نافذة تسجيل دفعة مستلمة من البقالة وتخفض مديونيتها فوراً")}
                  className="rounded-xl bg-[#0652DD] text-white px-3.5 py-1.5 text-xs font-black hover:bg-[#0542b3]"
                >
                  💰 + تسجيل دفعة مستلمة من البقالة
                </button>
              </div>

              <table className="w-full min-w-[700px] border-collapse text-xs rounded-xl overflow-hidden border border-slate-200">
                <thead className="bg-[#0652DD] text-white font-bold">
                  <tr>
                    <th className="p-2.5 text-center">التاريخ</th>
                    <th className="p-2.5 text-start border-l border-white/20">العملية / البيان</th>
                    <th className="p-2.5 text-start border-l border-white/20">تفاصيل الخضروات المسلمة للبقالة</th>
                    <th className="p-2.5 text-center border-l border-white/20">إجمالي اليوم</th>
                    <th className="p-2.5 text-center border-l border-white/20">المسدد للإدارة</th>
                    <th className="p-2.5 text-center border-l border-white/20">المتبقي على البقالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="p-2.5 text-center font-bold">16/10/2026</td>
                    <td className="p-2.5 font-semibold">كشف الجمعة</td>
                    <td className="p-2.5 text-slate-700">
                      • كوبش: (1 × 1,300 = 1,300) | • جزر: (½ × 3,200 = 1,600) | • بيبار: (1 × 2,700 = 2,700)<br />
                      • باميه: (½ × 2,800 = 1,400) | • كوسه: (½ × 1,500 = 750) | • اسود: (½ × 800 = 400)<br />
                      • ليم: (1 × 3,000 = 3,000) | • خيار: (4 × 1,200 = 4,800)
                    </td>
                    <td className="p-2.5 text-center font-bold">14,450</td>
                    <td className="p-2.5 text-center">0</td>
                    <td className="p-2.5 text-center font-black">14,450</td>
                  </tr>
                  <tr className="bg-emerald-50">
                    <td className="p-2.5 text-center font-bold">16/10/2026</td>
                    <td className="p-2.5 font-bold text-emerald-800">سند قبض #18</td>
                    <td className="p-2.5 text-emerald-900 font-semibold">دفعة نقدية مسلّمة للإدارة من حساب البقالة (ص)</td>
                    <td className="p-2.5 text-center">—</td>
                    <td className="p-2.5 text-center font-black text-emerald-700">10,000</td>
                    <td className="p-2.5 text-center font-black">4,450</td>
                  </tr>
                </tbody>
                <tfoot className="bg-[#ffeaa7] text-slate-900 font-bold border-t-2 border-[#fdcb6e]">
                  <tr>
                    <td colSpan={3} className="p-2.5 text-start font-black">
                      الإجمالي النهائي لكشف حساب البقالة (ص)
                    </td>
                    <td className="p-2.5 text-center font-black">14,450 ريال</td>
                    <td className="p-2.5 text-center font-black text-emerald-800">10,000 ريال</td>
                    <td className="p-2.5 text-center font-black text-[#0652DD]">المطلوب: 4,450 ريال</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* الشاشة 4: لوحة المدير - الصلاحيات والتدقيق */}
        {/* ======================================================== */}
        {activeTab === 4 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-[#1e3799]">
                ⚙️ لوحة تحكم المدير بصلاحيات العامل وإدارة البقالات وسجل التدقيق
              </h2>
              <div className="flex gap-2">
                <button onClick={() => alert("إضافة بقالة جديدة")} className="rounded-xl bg-[#0652DD] text-white px-3 py-1.5 text-xs font-bold">
                  🏪 + إضافة بقالة جديدة
                </button>
                <button onClick={() => alert("إضافة مستخدم جديد")} className="rounded-xl bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold">
                  👤 + إضافة مستخدم (صاحب بقالة)
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black text-[#0c2461] mb-2.5">
                أولاً: مفاتيح فتح وإغلاق الخدمات للعامل (تعمل بضغطة زر فورية):
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                  <div>
                    <strong className="text-xs text-slate-900 block font-black">
                      1. السماح للعامل بإضافة (مورد جديد) إلى قائمة الموردين
                    </strong>
                    <span className="text-[11px] text-slate-500">
                      إذا أغلقت هذه الميزة، يلتزم العامل بالموردين الموجودين في القائمة المنسدلة فقط.
                    </span>
                  </div>
                  <button
                    onClick={() => setPermAddSupplier(!permAddSupplier)}
                    className={`rounded-full px-4 py-1.5 text-xs font-black text-white ${permAddSupplier ? "bg-[#2ed573]" : "bg-[#ff4757]"
                      }`}
                  >
                    {permAddSupplier ? "مفتوح ✅" : "مغلق ❌"}
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                  <div>
                    <strong className="text-xs text-slate-900 block font-black">
                      2. السماح للعامل بإضافة (صنف خضروات جديد) إلى جدول الكشف
                    </strong>
                    <span className="text-[11px] text-slate-500">
                      يتيح للعامل إضافة سطر لصنف جديد غير موجود في الأصناف الأساسية.
                    </span>
                  </div>
                  <button
                    onClick={() => setPermAddProduct(!permAddProduct)}
                    className={`rounded-full px-4 py-1.5 text-xs font-black text-white ${permAddProduct ? "bg-[#2ed573]" : "bg-[#ff4757]"
                      }`}
                  >
                    {permAddProduct ? "مفتوح ✅" : "مغلق ❌"}
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                  <div>
                    <strong className="text-xs text-slate-900 block font-black">
                      3. السماح للعامل بتعديل كميات البقالات والعدد الإجمالي حتى نهاية اليوم
                    </strong>
                    <span className="text-[11px] text-slate-500">
                      إذا أغلقته، يقفل الكشف ولا يستطيع العامل تغيير أي رقم بعد حفظه.
                    </span>
                  </div>
                  <button
                    onClick={() => setPermEditQty(!permEditQty)}
                    className={`rounded-full px-4 py-1.5 text-xs font-black text-white ${permEditQty ? "bg-[#2ed573]" : "bg-[#ff4757]"
                      }`}
                  >
                    {permEditQty ? "مفتوح ✅" : "مغلق ❌"}
                  </button>
                </div>
              </div>
            </div>

            {/* سجل التدقيق */}
            <div>
              <h3 className="text-xs font-black text-[#0c2461] mb-2.5">
                ثانياً: سجل التدقيق والمراجعة الشامل (Audit Log) - يراقب كل حركة بالساعة والدقيقة:
              </h3>
              <table className="w-full min-w-[700px] border-collapse text-xs rounded-xl overflow-hidden border border-slate-200">
                <thead className="bg-[#2f3542] text-white font-bold">
                  <tr>
                    <th className="p-2 text-center">التاريخ</th>
                    <th className="p-2 text-center border-l border-white/20">الوقت الدقيق</th>
                    <th className="p-2 text-start border-l border-white/20">المستخدم</th>
                    <th className="p-2 text-start border-l border-white/20">نوع العملية</th>
                    <th className="p-2 text-start border-l border-white/20">التفاصيل الدقيقة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="p-2 text-center">15/10/2026</td>
                    <td className="p-2 text-center text-slate-500">09:30:15 م</td>
                    <td className="p-2 font-bold text-slate-900">العامل (أحمد)</td>
                    <td className="p-2 font-semibold">إدخال طلبات الليل</td>
                    <td className="p-2 text-slate-700">قام بإدخال كميات طلبات البقالات لكشف يوم الجمعة وإنشاء الجدول السفلي.</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-center">16/10/2026</td>
                    <td className="p-2 text-center text-slate-500">07:15:40 ص</td>
                    <td className="p-2 font-bold text-slate-900">العامل (أحمد)</td>
                    <td className="p-2 font-semibold">إضافة مورد جديد</td>
                    <td className="p-2 text-slate-700">أضاف مورداً جديداً للقائمة باسم: (عمار الخيار).</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-center">16/10/2026</td>
                    <td className="p-2 text-center text-slate-500">07:45:10 ص</td>
                    <td className="p-2 font-bold text-slate-900">العامل (أحمد)</td>
                    <td className="p-2 font-semibold">تعديل كمية</td>
                    <td className="p-2 text-slate-700">عدّل كمية صنف (خيار) للبقالة (ص) من 3 إلى 4، وتحدث الإجمالي إلى 10.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* الشاشة 5: بوابة صاحب البقالة (قراءة فقط) */}
        {/* ======================================================== */}
        {activeTab === 5 && (
          <div className="rounded-2xl border-t-4 border-t-[#0652DD] border border-slate-200 bg-white p-5 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-[#0652DD]">
                  👁️ بوابة صاحب البقالة: كشف حساب البقالة (ص) - قراءة فقط
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  مرحباً بك | هذه الشاشة مخصصة لمراجعة فواتيرك اليومية وحسابك بدقة (لا يمكن التعديل)
                </p>
              </div>
              <span className="rounded-full bg-blue-100 text-[#0652DD] px-3 py-1 text-xs font-black border border-blue-200">
                صلاحية: مشاهدة ومراجعة فقط (Read-Only)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border-r-6 border-r-[#0652DD] border border-slate-200 bg-white p-4 shadow-xs">
                <div className="text-xs text-slate-500 font-bold mb-1">إجمالي مسحوبات الخضار (خلال الفترة)</div>
                <div className="text-2xl font-black text-slate-900">14,450 ريال</div>
              </div>
              <div className="rounded-2xl border-r-6 border-r-emerald-600 border border-slate-200 bg-white p-4 shadow-xs">
                <div className="text-xs text-slate-500 font-bold mb-1">إجمالي المبالغ التي سددتها</div>
                <div className="text-2xl font-black text-emerald-700">10,000 ريال</div>
              </div>
              <div className="rounded-2xl border-r-6 border-r-[#EA2027] border border-slate-200 bg-white p-4 shadow-xs">
                <div className="text-xs text-slate-500 font-bold mb-1">المبلغ الصافي المتبقي عليك</div>
                <div className="text-2xl font-black text-[#EA2027]">4,450 ريال</div>
              </div>
            </div>

            <table className="w-full min-w-[700px] border-collapse text-xs rounded-xl overflow-hidden border border-slate-200">
              <thead className="bg-[#0652DD] text-white font-bold">
                <tr>
                  <th className="p-2.5 text-center">التاريخ</th>
                  <th className="p-2.5 text-start border-l border-white/20">البيان</th>
                  <th className="p-2.5 text-start border-l border-white/20">تفاصيل الخضروات المسلمة للبقالة</th>
                  <th className="p-2.5 text-center border-l border-white/20">إجمالي الفاتورة</th>
                  <th className="p-2.5 text-center border-l border-white/20">المسدد منك</th>
                  <th className="p-2.5 text-center border-l border-white/20">المتبقي عليك</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2.5 text-center font-bold">16/10/2026</td>
                  <td className="p-2.5 font-semibold">طلبات الجمعة</td>
                  <td className="p-2.5 text-slate-700">
                    • كوبش: (1 × 1,300 = 1,300) | • جزر: (½ × 3,200 = 1,600) | • بيبار: (1 × 2,700 = 2,700)<br />
                    • باميه: (½ × 2,800 = 1,400) | • كوسه: (½ × 1,500 = 750) | • اسود: (½ × 800 = 400)<br />
                    • ليم: (1 × 3,000 = 3,000) | • خيار: (4 × 1,200 = 4,800)
                  </td>
                  <td className="p-2.5 text-center font-bold">14,450</td>
                  <td className="p-2.5 text-center">0</td>
                  <td className="p-2.5 text-center font-black">14,450</td>
                </tr>
                <tr className="bg-emerald-50">
                  <td className="p-2.5 text-center font-bold">16/10/2026</td>
                  <td className="p-2.5 font-bold text-emerald-800">سند تسديد #18</td>
                  <td className="p-2.5 text-emerald-900 font-semibold">دفعة نقدية مسددة للإدارة</td>
                  <td className="p-2.5 text-center">—</td>
                  <td className="p-2.5 text-center font-black text-emerald-700">10,000</td>
                  <td className="p-2.5 text-center font-black">4,450</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
