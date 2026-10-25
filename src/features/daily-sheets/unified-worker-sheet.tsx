"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  Printer,
  Table as TableIcon,
  LayoutGrid,
  Send,
  Save,
  Moon,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { formatAmount, formatDate, formatQuantity } from "@/lib/format";
import { quickSavePurchaseLineAndDispositionsAction } from "@/features/daily-sheets/mutations";
import { submitAction, postAction } from "@/features/daily-sheets/mutations";
import { openDraftAction } from "@/features/daily-sheets/actions";
import { saveBulkNightOrdersAndCreateMorningSheetAction } from "@/features/operations/actions";
import { QuickAddModal } from "@/features/daily-sheets/quick-add-modal";
import type { SheetView } from "@/features/daily-sheets/data";
import type { ProductRow, StoreRow, SupplierRow } from "@/lib/supabase/types";

const FRACTION_BUTTONS = [
  { label: "½ (0.5)", value: "0.5" },
  { label: "¼ (0.25)", value: "0.25" },
  { label: "1.5 (واحد ونصف)", value: "1.5" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
];

export interface WorkerSheetRowState {
  lineId?: string;
  productId: string;
  productName: string;
  supplierId: string;
  price: string;
  isPurchased: boolean;
  storeQuantities: Record<string, string>; // storeId -> quantity
  totalQuantity: string;
}

export function UnifiedWorkerSheet({
  initialSheet,
  products,
  suppliers,
  stores,
  date,
  role,
  savedNightOrders,
}: {
  initialSheet: SheetView | null;
  products: ReadonlyArray<Pick<ProductRow, "id" | "name" | "sort_order" | "active" | "unit_name">>;
  suppliers: ReadonlyArray<Pick<SupplierRow, "id" | "name" | "active">>;
  stores: ReadonlyArray<Pick<StoreRow, "id" | "code" | "name" | "sort_order" | "active">>;
  date: string;
  role: "admin" | "worker";
  savedNightOrders?: Array<{
    storeId: string;
    storeName: string;
    storeCode: string;
    items: Array<{ productId: string; productName: string; quantity: string }>;
  }>;
}) {
  const router = useRouter();

  // وضع العرض على الهاتف: جدول أو بطاقات
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  // إدارة النافذة المنبثقة لإضافة صنف أو مورد جديد
  const [modalType, setModalType] = useState<"product" | "supplier" | null>(null);

  // حالة حفظ المسودة
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error" | "unsaved">("saved");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [nightSaveBadge, setNightSaveBadge] = useState<string>(
    savedNightOrders && savedNightOrders.length > 0 ? "محفوظ ومثبت للصباح ✅" : "قيد الإدخال ⏳"
  );
  const [savedOrders, setSavedOrders] = useState<Array<{
    storeId: string;
    storeName: string;
    storeCode: string;
    items: Array<{ productId: string; productName: string; quantity: string }>;
  }>>(savedNightOrders ?? []);

  // مؤشر الخلية المحددة لتطبيق أزرار الكسور
  const [selectedCell, setSelectedCell] = useState<{
    rowIndex: number;
    storeId?: string; // إذا كان في خلية بقالة
    isTotal?: boolean; // إذا كان في إجمالي العدد
  } | null>(null);

  // تهيئة سطور العمل اليومية من Sheet القادمة أو من الأصناف الافتراضية
  const [rows, setRows] = useState<WorkerSheetRowState[]>(() => {
    if (initialSheet && initialSheet.lines.length > 0) {
      return initialSheet.lines.map((l) => {
        const storeQuantities: Record<string, string> = {};
        for (const s of stores) {
          const d = l.dispositions.find((disp) => disp.store_id === s.id);
          storeQuantities[s.id] = d ? String(Number(d.quantity) || "") : "";
        }
        return {
          lineId: l.id,
          productId: l.product_id,
          productName: l.productName,
          supplierId: l.supplier_id || "",
          price: l.basket_unit_price || "",
          isPurchased: l.purchase_status === "purchased",
          storeQuantities,
          totalQuantity: l.purchased_quantity || "0",
        };
      });
    }

    // إذا لم تكن هناك سطور سابقة، يتم بناء الـ 16 صنف تلقائياً بالترتيب
    // مع جلب كميات طلبات الليل المحفوظة إن وُجدت
    return products.map((p) => {
      const storeQuantities: Record<string, string> = {};
      let autoTotal = 0;
      for (const s of stores) {
        const matchingOrder = savedNightOrders?.find((o) => o.storeId === s.id);
        const matchingItem = matchingOrder?.items.find((it) => it.productId === p.id);
        const q = matchingItem ? matchingItem.quantity : "";
        storeQuantities[s.id] = q && Number(q) > 0 ? q : "";
        if (q && Number(q) > 0) autoTotal += Number(q);
      }

      return {
        lineId: undefined,
        productId: p.id,
        productName: p.name,
        supplierId: "",
        price: "",
        isPurchased: false,
        storeQuantities,
        totalQuantity: autoTotal > 0 ? String(autoTotal) : "",
      };
    });
  });

  // تحديث كمية بقالة في سطر
  const handleStoreQtyChange = (rowIndex: number, storeId: string, val: string) => {
    if (val !== "" && !/^\d*(\.\d{0,3})?$/.test(val)) return;
    setRows((prev) => {
      const next = [...prev];
      const target = { ...next[rowIndex]! };
      const nextStoreQtys = { ...target.storeQuantities, [storeId]: val };
      target.storeQuantities = nextStoreQtys;

      // تحديث العدد الإجمالي تلقائياً بمجموع البقالات إذا لم يكن مدخلاً يدوياً
      let sum = 0;
      for (const s of stores) {
        const q = parseFloat(nextStoreQtys[s.id] || "0");
        if (!isNaN(q) && q > 0) sum += q;
      }
      target.totalQuantity = sum > 0 ? String(sum) : "";
      next[rowIndex] = target;
      return next;
    });
    setSaveStatus("unsaved");
  };

  // تطبيق زر كسر على الخلية المحددة حالياً
  const applyFraction = (val: string) => {
    if (!selectedCell) return;
    const { rowIndex, storeId } = selectedCell;
    if (storeId) {
      handleStoreQtyChange(rowIndex, storeId, val);
    } else {
      // تعديل حقل العدد الإجمالي مباشرة
      setRows((prev) => {
        const next = [...prev];
        const target = { ...next[rowIndex]! };
        target.totalQuantity = val;
        next[rowIndex] = target;
        return next;
      });
      setSaveStatus("unsaved");
    }
  };

  // تكرار الصنف لمورد ثانٍ بسعر ومورد مختلف
  const handleDuplicateRow = (rowIndex: number) => {
    const original = rows[rowIndex]!;
    const newRow: WorkerSheetRowState = {
      lineId: undefined,
      productId: original.productId,
      productName: original.productName,
      supplierId: "",
      price: "",
      isPurchased: false,
      storeQuantities: {},
      totalQuantity: "",
    };
    for (const s of stores) {
      newRow.storeQuantities[s.id] = "";
    }
    setRows((prev) => {
      const next = [...prev];
      next.splice(rowIndex + 1, 0, newRow);
      return next;
    });
    setSaveStatus("unsaved");
  };

  // تبديل حالة الشراء «قيد الشراء» / «تم الشراء»
  const handleTogglePurchased = (rowIndex: number) => {
    setRows((prev) => {
      const next = [...prev];
      const target = { ...next[rowIndex]! };
      target.isPurchased = !target.isPurchased;
      next[rowIndex] = target;
      return next;
    });
    setSaveStatus("unsaved");
  };

  // حفظ سطر فردي مباشرة في Supabase
  const handleSaveRow = async (rowIndex: number) => {
    const row = rows[rowIndex]!;
    if (!initialSheet) {
      // فتح المسودة أولاً إذا لم تكن موجودة
      const openRes = await openDraftAction({ date });
      if (!openRes.ok) {
        setStatusMessage("تعذر فتح اليومية: " + openRes.error);
        return;
      }
      window.location.reload();
      return;
    }

    setSaveStatus("saving");
    setStatusMessage("جارٍ الحفظ في Supabase...");

    const dispositions = stores
      .map((s) => ({
        store_id: s.id,
        quantity: row.storeQuantities[s.id] || "0",
        disposition_type: "store_distribution" as const,
        reason: null,
      }))
      .filter((d) => Number(d.quantity) > 0);

    const res = await quickSavePurchaseLineAndDispositionsAction({
      revisionId: initialSheet.revision.id,
      expectedVersion: initialSheet.sheet.version,
      line: {
        id: row.lineId,
        product_id: row.productId,
        supplier_id: row.supplierId || null,
        purchase_status: row.isPurchased ? "purchased" : "purchased", // مبدئياً مسجل
        purchased_quantity: row.totalQuantity || "0",
        basket_unit_price: row.price || null,
        note: null,
      },
      dispositions,
    });

    if (res.ok) {
      setSaveStatus("saved");
      setStatusMessage("تم الحفظ وتأكيد السطر من قاعدة البيانات");
      if (res.lineId) {
        setRows((prev) => {
          const next = [...prev];
          next[rowIndex] = { ...next[rowIndex]!, lineId: res.lineId };
          return next;
        });
      }
      router.refresh();
    } else {
      setSaveStatus("error");
      setStatusMessage("فشل الحفظ: " + res.message);
    }
  };

  // حفظ جميع السطور النشطة
  const handleSaveAllRows = async () => {
    if (!initialSheet) {
      const openRes = await openDraftAction({ date });
      if (!openRes.ok) {
        setStatusMessage("تعذر فتح المسودة: " + openRes.error);
        return;
      }
      window.location.reload();
      return;
    }

    setSaveStatus("saving");
    setStatusMessage("جارٍ حفظ جميع السطور في قاعدة البيانات...");

    let successCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const hasQty = Number(r.totalQuantity) > 0;
      if (hasQty || r.lineId) {
        const dispositions = stores
          .map((s) => ({
            store_id: s.id,
            quantity: r.storeQuantities[s.id] || "0",
            disposition_type: "store_distribution" as const,
            reason: null,
          }))
          .filter((d) => Number(d.quantity) > 0);

        const res = await quickSavePurchaseLineAndDispositionsAction({
          revisionId: initialSheet.revision.id,
          expectedVersion: initialSheet.sheet.version,
          line: {
            id: r.lineId,
            product_id: r.productId,
            supplier_id: r.supplierId || null,
            purchase_status: "purchased",
            purchased_quantity: r.totalQuantity || "0",
            basket_unit_price: r.price || null,
            note: null,
          },
          dispositions,
        });
        if (res.ok) successCount++;
      }
    }

    setSaveStatus("saved");
    setStatusMessage(`تم حفظ ${successCount} صنفاً في قاعدة البيانات بنجاح`);
    router.refresh();
  };

  // حفظ طلبات الليل وإنشاء الجدول السفلي وبطاقات الفرز
  const handleSaveNightOrders = async () => {
    setSaveStatus("saving");
    setStatusMessage("جارٍ حفظ وتثبيت طلبات الليل في قاعدة البيانات...");

    // بناء مصفوفة الطلبات لكل بقالة
    const orders = stores.map((s) => ({
      storeId: s.id,
      lines: rows
        .map((r) => ({
          product_id: r.productId,
          quantity: r.storeQuantities[s.id] || "0",
          note: null,
        }))
        .filter((l) => Number(l.quantity) > 0),
    }));

    const res = await saveBulkNightOrdersAndCreateMorningSheetAction({ date, orders });
    if (res.ok) {
      const updatedList = stores.map((s) => ({
        storeId: s.id,
        storeName: s.name,
        storeCode: s.code,
        items: rows
          .map((r) => ({
            productId: r.productId,
            productName: r.productName,
            quantity: r.storeQuantities[s.id] || "0",
          }))
          .filter((it) => Number(it.quantity) > 0),
      }));
      setSavedOrders(updatedList);
      setNightSaveBadge("تم حفظ وتثبيت طلبات الليل في الجدول السفلي بنجاح ✅");
      setSaveStatus("saved");
      setStatusMessage("تم حفظ وتثبيت طلبات الليل في قاعدة البيانات وبناء كشف الصباح بنجاح!");
      const el = document.getElementById("saved-night-orders-card");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else {
      setSaveStatus("error");
      setStatusMessage("تعذر حفظ طلبات الليل: " + res.message);
    }
  };

  // حفظ الشراء وترحيل الحسابات الذري
  const handleSaveAndPostSheet = async () => {
    const ok = window.confirm(
      `هل أنت متأكد من حفظ الشراء وترحيل الحركات المالية ليوم ${date}؟\nسيتم تثبيت التزامات الموردين ومديونيات البقالات بدقة دون تكرار القيود.`
    );
    if (!ok) return;

    setSaveStatus("saving");
    setStatusMessage("جارٍ حفظ الشراء وترحيل الحسابات...");
    await handleSaveAllRows();

    if (role === "admin" && initialSheet) {
      const res = await postAction({
        revisionId: initialSheet.revision.id,
        expectedVersion: initialSheet.sheet.version,
        idempotencyKey: `post-${initialSheet.revision.id}-${Date.now()}`,
      });
      if (res.ok) {
        setSaveStatus("saved");
        setStatusMessage("تم ترحيل الحركات المالية إلى دفتر الأستاذ بنجاح!");
        router.refresh();
      } else {
        setSaveStatus("error");
        setStatusMessage("تعذر الاعتماد: " + res.error);
      }
    } else if (role === "worker" && initialSheet) {
      const res = await submitAction({
        revisionId: initialSheet.revision.id,
        expectedVersion: initialSheet.sheet.version,
      });
      if (res.ok) {
        setSaveStatus("saved");
        setStatusMessage("تم إرسال اليومية لمراجعة واعتماد المدير بنجاح!");
        router.refresh();
      } else {
        setSaveStatus("error");
        setStatusMessage("تعذر الإرسال: " + res.error);
      }
    }
  };

  // مؤشرات التقارير والإنجاز اللحظي
  const totalItemsCount = rows.length;
  const purchasedItemsCount = rows.filter((r) => r.isPurchased && Number(r.totalQuantity) > 0).length;
  const progressPercent = totalItemsCount > 0 ? Math.round((purchasedItemsCount / totalItemsCount) * 100) : 0;
  const arabicDayName = new Intl.DateTimeFormat("ar-YE", { weekday: "long" }).format(
    new Date(date + "T12:00:00Z")
  );

  // إجمالي تكلفة الشراء اللحظي
  const estimatedTotalPurchaseValue = rows.reduce((acc, r) => {
    const q = parseFloat(r.totalQuantity || "0");
    const p = parseFloat(r.price || "0");
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) {
      return acc + q * p;
    }
    return acc;
  }, 0);

  return (
    <div className="space-y-4 pb-20">
      {/* النافذة المنبثقة لإضافة صنف أو مورد سريعاً */}
      <QuickAddModal
        isOpen={modalType !== null}
        type={modalType || "product"}
        onClose={() => setModalType(null)}
        onSuccess={() => { }}
      />

      {/* الشريط العلوي المتقدم للعمليات والإحصائيات */}
      <header className="rounded-2xl border border-border-subtle bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-900 font-bold text-white text-sm">
                ك
              </span>
              <h1 className="text-lg font-black text-brand-900">
                كشف المشتريات اليومي والتوزيع على البقالات
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              يوم العمل: <span className="num font-bold text-slate-800">{formatDate(date)}</span> · نظام
              المشتريات المباشرة والتوزيع اللحظي
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* تبديل طريقة العرض للجوال */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${viewMode === "table" ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                <TableIcon size={14} />
                <span>الجدول</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${viewMode === "cards" ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
              >
                <LayoutGrid size={14} />
                <span>بطاقات الجوال</span>
              </button>
            </div>

            {/* تصدير PDF لكشف اليوم */}
            <Link
              href={`/reports/pdf/daily-sheet?date=${date}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer size={15} />
              <span>كشف اليوم PDF</span>
            </Link>

            {/* زر حفظ الكل */}
            <button
              type="button"
              onClick={handleSaveAllRows}
              disabled={saveStatus === "saving"}
              className="flex items-center gap-1.5 rounded-xl bg-brand-900 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-brand-800 disabled:opacity-50"
            >
              {saveStatus === "saving" ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              <span>حفظ التعديلات</span>
            </button>
          </div>
        </div>

        {/* شريط الإنجاز والمؤشرات اللحظية */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <span className="text-slate-500 block text-[11px]">مؤشر إنجاز الشراء:</span>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="num font-black text-emerald-800">{progressPercent}%</span>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-2.5">
            <span className="text-slate-500 block text-[11px]">الأصناف المشتراة:</span>
            <span className="num font-black text-brand-900 text-sm">
              {purchasedItemsCount} / {totalItemsCount}
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-2.5">
            <span className="text-slate-500 block text-[11px]">إجمالي قيمة الشراء:</span>
            <span className="num font-black text-emerald-700 text-sm">
              {formatAmount(estimatedTotalPurchaseValue)}
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-2.5">
            <span className="text-slate-500 block text-[11px]">حالة الحفظ:</span>
            <span
              className={`font-bold inline-flex items-center gap-1 ${saveStatus === "saved"
                  ? "text-emerald-700"
                  : saveStatus === "saving"
                    ? "text-amber-600"
                    : saveStatus === "unsaved"
                      ? "text-rose-600"
                      : "text-rose-700"
                }`}
            >
              {saveStatus === "saved" && <CheckCircle2 size={13} />}
              {saveStatus === "saving" && <RefreshCw size={13} className="animate-spin" />}
              {saveStatus === "saved"
                ? "محفوظ في Supabase"
                : saveStatus === "saving"
                  ? "جارٍ الحفظ..."
                  : saveStatus === "unsaved"
                    ? "توجد تعديلات غير محفوظة"
                    : "خطأ في الحفظ"}
            </span>
          </div>
        </div>
      </header>

      {/* شريط أزرار الكسور السريعة وزر إضافة صنف / مورد */}
      <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2.5 backdrop-blur shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs font-bold text-slate-600 shrink-0">أزرار الكسور السريعة:</span>
          {FRACTION_BUTTONS.map((f) => (
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

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setModalType("product")}
            className="flex items-center gap-1 rounded-lg border border-brand-900/30 bg-brand-900/5 px-2.5 py-1.5 text-xs font-bold text-brand-900 hover:bg-brand-900 hover:text-white transition-colors"
          >
            <Plus size={14} />
            <span>إضافة صنف</span>
          </button>
          <button
            type="button"
            onClick={() => setModalType("supplier")}
            className="flex items-center gap-1 rounded-lg border border-brand-900/30 bg-brand-900/5 px-2.5 py-1.5 text-xs font-bold text-brand-900 hover:bg-brand-900 hover:text-white transition-colors"
          >
            <Plus size={14} />
            <span>إضافة مورد</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-brand-900/20 bg-brand-900/5 p-3 text-xs font-bold text-brand-900">
          {statusMessage}
        </div>
      )}

      {/* النمط الأول: الجدول الموحد الكامل بنظام RTL من اليمين إلى اليسار */}
      {viewMode === "table" ? (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-white shadow-sm">
          <table className="w-full min-w-[1020px] border-collapse text-sm">
            <thead className="bg-[#006266] text-white text-xs font-bold border-b border-[#004d4f]">
              {/* ترتيب الأعمدة وفق المواصفات: | ص | ح | س | ع | ك | العدد الإجمالي | الفارق | الصنف | السعر 1 | المورد | تأكيد الشراء | */}
              <tr>
                {stores.map((s) => (
                  <th key={s.id} className="p-3 text-center min-w-16 border-l border-[#004d4f]">
                    <div className="font-black text-base text-[#f6b93b]">{s.code}</div>
                    <div className="text-[10px] text-white/80 font-normal truncate max-w-16">{s.name}</div>
                  </th>
                ))}
                <th className="p-3 text-center bg-[#0c2461] text-white font-black min-w-28 border-l border-[#004d4f]">
                  العدد (المشترى)
                </th>
                <th className="sticky right-0 z-10 bg-[#006266] p-3 text-start min-w-36 border-l border-[#004d4f]">
                  الصنف (+)
                </th>
                <th className="p-3 text-center min-w-28 border-l border-[#004d4f]">
                  السعر 1 (للسلة)
                </th>
                <th className="p-3 text-center min-w-36 border-l border-[#004d4f]">المورد</th>
                <th className="p-3 text-center min-w-32 bg-[#009432]">تأكيد الشراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((row, idx) => {
                const sumDistributed = stores.reduce(
                  (acc, s) => acc + (parseFloat(row.storeQuantities[s.id] || "0") || 0),
                  0
                );
                const purchasedQty = parseFloat(row.totalQuantity || "0") || 0;
                const variance = purchasedQty - sumDistributed;
                const isPriceSet = parseFloat(row.price || "0") > 0;
                const isBought = row.isPurchased && isPriceSet;
                const isCancelled = !isPriceSet || !row.isPurchased;

                return (
                  <tr
                    key={`${row.productId}-${idx}`}
                    className={`transition-colors ${
                      isBought
                        ? "bg-[#e8f8f5] hover:bg-[#d8f3ec]"
                        : isCancelled && purchasedQty > 0
                          ? "bg-[#fff5f5] hover:bg-[#ffebeb]"
                          : idx % 2 === 0
                            ? "bg-white hover:bg-slate-50/50"
                            : "bg-slate-50/20 hover:bg-slate-50/60"
                    }`}
                  >
                    {/* أعمدة البقالات: ص، ح، س، ع، ك */}
                    {stores.map((s) => {
                      const isCellActive =
                        selectedCell?.rowIndex === idx && selectedCell?.storeId === s.id;
                      const val = row.storeQuantities[s.id] || "";
                      const hasVal = Number(val) > 0;

                      return (
                        <td
                          key={s.id}
                          className={`p-1.5 text-center border-l border-border-subtle ${
                            isCellActive ? "ring-2 ring-brand-800 bg-brand-800/10" : ""
                          }`}
                        >
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="—"
                            value={val}
                            onFocus={() => setSelectedCell({ rowIndex: idx, storeId: s.id })}
                            onChange={(e) => handleStoreQtyChange(idx, s.id, e.target.value)}
                            className={`num h-10 w-full rounded-lg text-center text-sm font-bold transition-all border ${
                              hasVal
                                ? "border-emerald-500 bg-emerald-50/80 text-emerald-950 font-black shadow-inner"
                                : "border-slate-200 bg-white text-slate-700"
                            } focus:border-brand-900 focus:outline-none`}
                          />
                        </td>
                      );
                    })}

                    {/* العدد المشترى (الإجمالي) مع مؤشر الفوارق اللحظي */}
                    <td className="num p-2 text-center font-black text-brand-900 bg-brand-900/5 text-base border-l border-border-subtle">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.totalQuantity}
                        placeholder="0"
                        onFocus={() => setSelectedCell({ rowIndex: idx, isTotal: true })}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val !== "" && !/^\d*(\.\d{0,3})?$/.test(val)) return;
                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx]!, totalQuantity: val };
                            return next;
                          });
                          setSaveStatus("unsaved");
                        }}
                        className="num h-10 w-20 rounded-lg text-center text-sm font-black border border-brand-900/30 bg-white text-brand-900 shadow-sm focus:border-brand-900 focus:outline-none"
                      />
                      {/* مؤشر الفوارق الدقيق */}
                      {purchasedQty > 0 && (
                        <div className="mt-1">
                          {variance > 0 ? (
                            <span className="inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-black text-amber-800" title="فائض غير موزع على البقالات">
                              +{formatQuantity(variance)} غير موزع
                            </span>
                          ) : variance < 0 ? (
                            <span className="inline-block rounded bg-rose-100 px-1 py-0.5 text-[10px] font-black text-rose-800" title="عجز توزيع">
                              {formatQuantity(variance)} عجز
                            </span>
                          ) : (
                            <span className="inline-block rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-bold text-emerald-800">
                              موزع بالكامل ✅
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* الصنف مع زر (+) للتكرار */}
                    <td className="sticky right-0 z-10 bg-inherit p-2 font-bold text-slate-900 border-l border-border-subtle">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-bold">{row.productName}</span>
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(idx)}
                          title="شراء من مورد آخر بسعر مختلف (+)"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-600 hover:text-white transition-colors"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </td>

                    {/* السعر 1 (سعر السلة) */}
                    <td className="p-1.5 border-l border-border-subtle text-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="السعر"
                        value={row.price}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val !== "" && !/^\d*(\.\d{0,2})?$/.test(val)) return;
                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx]!, price: val };
                            return next;
                          });
                          setSaveStatus("unsaved");
                        }}
                        className={`num h-10 w-24 rounded-lg text-center text-sm font-bold border ${
                          isPriceSet ? "border-amber-400 bg-amber-50/50 text-slate-900" : "border-slate-300 bg-white text-slate-800"
                        } focus:border-brand-900 focus:outline-none`}
                      />
                    </td>

                    {/* المورد */}
                    <td className="p-1.5 border-l border-border-subtle text-center">
                      <select
                        value={row.supplierId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx]!, supplierId: val };
                            return next;
                          });
                          setSaveStatus("unsaved");
                        }}
                        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-brand-900 focus:outline-none"
                      >
                        <option value="">اختر مورد...</option>
                        {suppliers.map((sup) => (
                          <option key={sup.id} value={sup.id}>
                            {sup.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* حالة الشراء مع زر التبديل «قيد الشراء» / «تم الشراء» */}
                    <td className="p-1.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePurchased(idx)}
                          className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black shadow-xs transition-all ${
                            row.isPurchased
                              ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                              : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                          }`}
                        >
                          {row.isPurchased ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                          <span>{row.isPurchased ? "تم الشراء ✅" : "⏳ قيد الشراء"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveRow(idx)}
                          title="حفظ هذا السطر في قاعدة البيانات"
                          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-brand-900 hover:text-white transition-colors"
                        >
                          <Save size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* شريط الإجماليات السفلي وأزرار حفظ الليل والترحيل */}
            <tfoot className="bg-[#ffeaa7] text-slate-900 border-t-2 border-[#fdcb6e]">
              <tr>
                {stores.map((s) => {
                  const storeSum = rows.reduce((acc, r) => {
                    const q = parseFloat(r.storeQuantities[s.id] || "0") || 0;
                    const p = parseFloat(r.price || "0") || 0;
                    return acc + (q * p);
                  }, 0);
                  return (
                    <td key={s.id} className="p-2.5 text-center border-l border-[#fdcb6e] font-black text-xs">
                      <div className="num text-slate-900 text-sm">{formatAmount(storeSum)}</div>
                      <div className="text-[10px] text-slate-600 font-normal">إجمالي {s.code}</div>
                    </td>
                  );
                })}
                <td className="p-2.5 text-center bg-[#f6b93b] text-[#0c2461] border-l border-[#fdcb6e] font-black text-sm">
                  <div className="num font-black text-base">{formatAmount(estimatedTotalPurchaseValue)}</div>
                  <div className="text-[10px] font-bold">إجمالي المشتريات</div>
                </td>
                <td className="p-2.5 text-start font-black text-xs border-l border-[#fdcb6e] text-slate-900">
                  الإجمالي اليومي
                </td>
                <td colSpan={3} className="p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveNightOrders}
                      className="flex-1 min-w-[200px] flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 shadow-sm transition-all"
                    >
                      <Moon size={14} />
                      <span>🌙 1. حفظ طلبات الليل (تثبيت وإنشاء الجدول السفلي)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAndPostSheet}
                      className="flex-1 min-w-[200px] flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 shadow-sm transition-all"
                    >
                      <Save size={14} />
                      <span>💾 2. حفظ الشراء وترحيل الحسابات</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        /* النمط الثاني: بطاقات الجوال Mobile-First بيد واحدة */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((row, idx) => (
            <div
              key={`${row.productId}-${idx}`}
              className={`rounded-2xl border p-4 space-y-3 shadow-xs transition-all ${row.isPurchased
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-slate-200 bg-white"
                }`}
            >
              {/* ترويسة البطاقة */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-900 font-bold text-white text-xs">
                    {idx + 1}
                  </span>
                  <span className="text-base font-black text-brand-900">{row.productName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDuplicateRow(idx)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTogglePurchased(idx)}
                    className={`flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-black ${row.isPurchased
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {row.isPurchased ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                    <span>{row.isPurchased ? "تم الشراء" : "قيد الشراء"}</span>
                  </button>
                </div>
              </div>

              {/* حقول الشراء: المورد والسعر والكمية الإجمالية */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-slate-500 font-semibold block mb-1">المورد:</label>
                  <select
                    value={row.supplierId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, supplierId: val };
                        return next;
                      });
                      setSaveStatus("unsaved");
                    }}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="">اختر مورد...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 font-semibold block mb-1">سعر السلة:</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="السعر"
                    value={row.price}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== "" && !/^\d*(\.\d{0,2})?$/.test(val)) return;
                      setRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, price: val };
                        return next;
                      });
                      setSaveStatus("unsaved");
                    }}
                    className="num h-9 w-full rounded-lg border border-slate-300 px-2 text-center text-xs font-bold"
                  />
                </div>
              </div>

              {/* توزيع البقالات ص، ح، س، ع، ك */}
              <div className="border-t border-slate-100 pt-2">
                <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                  توزيع كميات البقالات:
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {stores.map((s) => (
                    <div key={s.id} className="text-center">
                      <span className="text-[10px] font-black text-brand-900 block mb-0.5">
                        {s.code}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="—"
                        value={row.storeQuantities[s.id] || ""}
                        onFocus={() => setSelectedCell({ rowIndex: idx, storeId: s.id })}
                        onChange={(e) => handleStoreQtyChange(idx, s.id, e.target.value)}
                        className={`num h-9 w-full rounded-lg text-center text-xs font-bold border ${Number(row.storeQuantities[s.id]) > 0
                            ? "border-emerald-500 bg-emerald-50 text-emerald-950 font-black"
                            : "border-slate-200 bg-white text-slate-700"
                          }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* تذييل البطاقة والإجمالي */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                <div>
                  <span className="text-slate-500 text-[11px]">العدد الإجمالي: </span>
                  <span className="num font-black text-brand-900 text-sm">
                    {row.totalQuantity || "0"} سلة
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveRow(idx)}
                  className="flex items-center gap-1 rounded-lg bg-brand-900 px-3 py-1.5 font-bold text-white text-[11px]"
                >
                  <Save size={12} />
                  <span>حفظ</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================================================= */}
      {/* الجدول السفلي المحفوظ: طلبات البقالات المحفوظة من الليل */}
      {/* ======================================================= */}
      <section id="saved-night-orders-card" className="mt-8 rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-white to-blue-50/20 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-xs">
                📌
              </span>
              <h2 className="text-base font-black text-blue-900">
                ثانياً: جدول طلبات البقالات المحفوظ من الليل (كل بقالة ماذا تريد فقط)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              يُنشأ هذا الجدول تلقائياً عند حفظ طلبات الليل ليحتفظ بالبيانات ثابتة أمام العامل عند الشراء والفرز في الصباح دون تشتت بالأسعار والموردين.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800 border border-blue-300">
              {nightSaveBadge}
            </span>
            <Link
              href={`/reports/pdf/morning-orders?date=${date}`}
              target="_blank"
              className="flex items-center gap-1 rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <Printer size={14} />
              <span>معاينة كشف الصباح PDF</span>
            </Link>
          </div>
        </div>

        {/* جدول المقارنة بدون أسعار وموردين (نقاء كشف الصباح) */}
        <div className="overflow-x-auto rounded-xl border border-blue-200 bg-white">
          <table className="w-full min-w-[700px] border-collapse text-xs">
            <thead className="bg-[#0984e3] text-white font-bold border-b border-[#0652DD]">
              <tr>
                <th className="p-2.5 text-start w-10">م</th>
                <th className="p-2.5 text-start min-w-32">الصنف المطلوب</th>
                {stores.map((s) => (
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
              {products.map((p, idx) => {
                let reqTotal = 0;
                return (
                  <tr key={p.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="num p-2 text-center text-slate-400">{idx + 1}</td>
                    <td className="p-2 font-black text-slate-900">{p.name}</td>
                    {stores.map((s) => {
                      const matchingOrder = savedOrders.find((o) => o.storeId === s.id);
                      const item = matchingOrder?.items.find((it) => it.productId === p.id);
                      const q = item ? parseFloat(item.quantity) : 0;
                      if (!isNaN(q) && q > 0) reqTotal += q;

                      return (
                        <td
                          key={s.id}
                          className={`num p-2 text-center border-l border-slate-100 ${
                            q > 0 ? "font-black text-blue-900 bg-blue-50/30" : "text-slate-300"
                          }`}
                        >
                          {q > 0 ? formatQuantity(q) : "—"}
                        </td>
                      );
                    })}
                    <td className="num p-2 text-center font-black bg-[#e8f8f5] text-[#006266] text-sm border-l border-slate-100">
                      {reqTotal > 0 ? `${formatQuantity(reqTotal)} سلة` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* بطاقات فرز منفصلة لكل بقالة */}
        <div>
          <h3 className="mb-2 text-xs font-black text-slate-800">
            📦 بطاقات الفرز السريع للسيارات (كل بقالة ماذا تريد بالتفصيل):
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {stores.map((s) => {
              const matchingOrder = savedOrders.find((o) => o.storeId === s.id);
              const items = matchingOrder?.items.filter((it) => Number(it.quantity) > 0) || [];
              const totalS = items.reduce((acc, it) => acc + Number(it.quantity), 0);

              return (
                <div key={s.id} className="rounded-xl border border-slate-200 border-t-4 border-t-[#0984e3] p-3 bg-white shadow-xs space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="font-black text-xs text-brand-900">
                      🏪 {s.code} · {s.name}
                    </span>
                    <span className="num font-black text-[11px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      {items.length} أصناف
                    </span>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-1">لا توجد طلبات مسجلة</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 text-[11px] max-h-48 overflow-y-auto">
                      {items.map((it, i) => (
                        <li key={i} className="flex items-center justify-between py-1">
                          <span className="text-slate-700 font-semibold">{it.productName}</span>
                          <span className="num font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                            {formatQuantity(it.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="pt-1 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between font-bold">
                    <span>إجمالي السلات:</span>
                    <span className="num font-black text-emerald-700">{formatQuantity(totalS)} سلة</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* قسم الإجراءات والاعتماد المحاسبي والترحيل المالي */}
      {initialSheet && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-brand-900">اعتماد وترحيل الحركات المالية</h3>
              <p className="text-xs text-slate-500">
                حالة اليومية: <strong>{initialSheet.sheet.status}</strong> · الإصدار {initialSheet.revision.revision_no}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {role === "admin" && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = window.confirm(
                      `هل أنت متأكد من اعتماد كشف مشتريات وتوزيع يوم ${date}؟\nسيتم ترحيل القيود المالية إلى دفتر الأستاذ وحسابات البقالات والموردين.`
                    );
                    if (!ok) return;
                    setSaveStatus("saving");
                    setStatusMessage("جارٍ ترحيل اليومية واعتماد القيود...");
                    const res = await postAction({
                      revisionId: initialSheet.revision.id,
                      expectedVersion: initialSheet.sheet.version,
                      idempotencyKey: `post-${initialSheet.revision.id}-${Date.now()}`,
                    });
                    if (res.ok) {
                      setSaveStatus("saved");
                      setStatusMessage("تم اعتماد اليومية وترحيل القيود المالية بنجاح!");
                      router.refresh();
                    } else {
                      setSaveStatus("error");
                      setStatusMessage("تعذر الاعتماد: " + res.error);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white hover:bg-emerald-800 shadow-sm"
                >
                  <CheckCircle2 size={15} />
                  <span>اعتماد اليومية وترحيل القيود للمدير</span>
                </button>
              )}

              {initialSheet.sheet.status === "draft" && (
                <button
                  type="button"
                  onClick={async () => {
                    setSaveStatus("saving");
                    setStatusMessage("جارٍ إرسال اليومية للمراجعة...");
                    const res = await submitAction({
                      revisionId: initialSheet.revision.id,
                      expectedVersion: initialSheet.sheet.version,
                    });
                    if (res.ok) {
                      setSaveStatus("saved");
                      setStatusMessage("تم إرسال اليومية للمراجعة بنجاح");
                      router.refresh();
                    } else {
                      setSaveStatus("error");
                      setStatusMessage("تعذر الإرسال: " + res.error);
                    }
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-900 px-4 py-2 text-xs font-bold text-white hover:bg-brand-800 shadow-sm"
                >
                  <Send size={14} />
                  <span>تقديم للمراجعة</span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
