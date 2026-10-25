"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock3, Loader2, Plus, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { evaluateReadiness } from "@/features/daily-sheets/domain/allocation";
import { toDomainDispositions, toDomainLines, type SheetView } from "@/features/daily-sheets/data";
import { PurchaseLineRow } from "@/features/daily-sheets/purchase-line-row";
import { openDraftAction } from "@/features/daily-sheets/actions";
import { cancelLineAction, postAction, postCorrectionAction, submitAction } from "@/features/daily-sheets/mutations";
import { formatAmount } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/rpc";
import { Alert, EmptyState, StatusBadge } from "@/components/ui/status";
import { Card, StatCard } from "@/components/ui/primitives";
import type { ProductRow, StoreRow, SupplierRow } from "@/lib/supabase/types";

type Role = "admin" | "worker";

export function SheetEditor({
  initialSheet,
  products,
  suppliers,
  stores,
  role,
  date,
}: {
  initialSheet: SheetView | null;
  products: ReadonlyArray<Pick<ProductRow, "id" | "name" | "sort_order" | "active" | "unit_name">>;
  suppliers: ReadonlyArray<Pick<SupplierRow, "id" | "name" | "active">>;
  stores: ReadonlyArray<Pick<StoreRow, "id" | "code" | "name" | "sort_order" | "active">>;
  role: Role;
  date: string;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetView | null>(initialSheet);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [postKey, setPostKey] = useState(() => newIdempotencyKey("post"));
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const editable = sheet?.sheet.status === "draft" && sheet.revision.status === "draft";
  const canPost = role === "admin" && sheet?.sheet.status === "ready_for_review";

  const readiness = useMemo(() => {
    if (!sheet) return null;
    return evaluateReadiness(toDomainLines(sheet.lines), toDomainDispositions(sheet.lines));
  }, [sheet]);

  const saveIndicator = loading
    ? { text: "جارٍ التحديث…", className: "text-warn-600" }
    : busy
      ? { text: "جارٍ الحفظ…", className: "text-warn-600" }
      : notice
        ? { text: notice, className: "text-green-900" }
        : { text: "محفوظ على الخادم", className: "text-slate-500" };

  const openOrReload = async () => {
    setLoading(true);
    setError("");
    const result = await openDraftAction({ date });
    if (!result.ok) setError(result.error ?? "تعذر فتح المسودة");
    setLoading(false);
    if (result.ok) router.refresh();
  };

  const onLineSaved = (version: number) => {
    setNotice("حُفظ السطر");
    setSheet((prev) =>
      prev ? { ...prev, sheet: { ...prev.sheet, version }, revision: { ...prev.revision, version } } : prev,
    );
    router.refresh();
  };

  const submit = async () => {
    if (!sheet) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await submitAction({ revisionId: sheet.revision.id, expectedVersion: sheet.sheet.version });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "تعذر تقديم اليومية");
    setNotice("اليومية جاهزة للمراجعة");
    router.refresh();
  };

  const post = async () => {
    if (!sheet) return;
    const confirmed = window.confirm(
      `اعتماد اليومية ${date}\nإجمالي الشراء: ${readiness?.purchaseTotal ?? "—"}\nإجمالي التوزيع: ${readiness?.distributedTotal ?? "—"}\n\nالاعتماد يُنشئ قيودًا مالية لا يمكن تعديلها لاحقًا دون قيد تصحيح. هل تريد المتابعة؟`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const postInput = {
      revisionId: sheet.revision.id,
      expectedVersion: sheet.sheet.version,
      idempotencyKey: postKey,
    };
    const result = sheet.revision.revision_kind === "correction"
      ? await postCorrectionAction(postInput)
      : await postAction(postInput);
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "تعذر اعتماد اليومية");
    setNotice("تم اعتماد اليومية وترحيل القيود");
    setPostKey(newIdempotencyKey("post"));
    router.refresh();
  };

  const cancelLine = async () => {
    if (!sheet || !cancelTarget) return;
    if (!cancelReason.trim()) return setError("سبب الإلغاء مطلوب");
    setBusy(true);
    const result = await cancelLineAction({
      lineId: cancelTarget,
      expectedVersion: sheet.sheet.version,
      reason: cancelReason.trim(),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "تعذر إلغاء السطر");
    setCancelTarget(null);
    setCancelReason("");
    setNotice("أُلغي السطر مع حفظ الأثر");
    router.refresh();
  };

  if (!sheet) {
    return (
      <Card
        title={`كشف يوم ${date}`}
        actions={
          <button
            type="button"
            onClick={openOrReload}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-brand-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            فتح/إنشاء مسودة
          </button>
        }
      >
        <EmptyState title="لا توجد يومية لهذا التاريخ" hint="افتح مسودة للبدء بإدخال مشتريات السوق." />
        {error ? (
          <div className="mt-3">
            <Alert title="تعذر تنفيذ العملية">{error}</Alert>
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title={`كشف يوم ${date}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={sheet.sheet.status} />
            <span className="rounded-full bg-surface px-2 py-1 text-xs text-slate-600 num">
              إصدار {sheet.revision.revision_no} · نسخة {sheet.sheet.version}
            </span>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="flex items-center gap-1 rounded-lg border-border-subtle px-2 py-1 text-xs"
              aria-label="تحديث البيانات"
            >
              <RotateCcw size={14} /> تحديث
            </button>
            <span className={`text-xs ${saveIndicator.className}`} aria-live="polite">
              {saveIndicator.text}
            </span>
          </div>
        }
      >
        {error ? <Alert title="تعذر تنفيذ العملية">{error}</Alert> : null}
        {!error && notice ? <Alert tone="success" title={notice} /> : null}
        {sheet.revision.revision_kind === "correction" ? (
          <div className="mt-3">
            <Alert tone="warn" title="إصدار تصحيح">
              {sheet.revision.reason ?? "تعديل يوم سبق ترحيله"} — الاعتماد سيثبت قيد عكس ثم قيدًا جديدًا دون المساس بالسندات
              والأثر الأصلي.
            </Alert>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="قيمة الشراء" value={readiness ? formatAmount(readiness.purchaseTotal) : "—"} />
        <StatCard label="المحمّل على البقالات" value={readiness ? formatAmount(readiness.distributedTotal) : "—"} tone="green" />
        <StatCard label="مخزون / تالف" value={readiness ? `${formatAmount(readiness.inventoryTotal)} / ${formatAmount(readiness.damagedTotal)}` : "—"} tone="gold" />
        <StatCard label="الفرق" value={readiness ? formatAmount(readiness.difference) : "—"} tone={readiness && readiness.difference !== "0.00" ? "gold" : "violet"} hint="يجب أن يساوي صفرًا قبل الترحيل" />
      </div>

      {readiness && readiness.issues.length > 0 ? (
        <Card title="تحقق الاكتمال">
          <ul className="space-y-1 text-sm">
            {readiness.issues.slice(0, 12).map((issue, index) => (
              <li key={`${issue.code}-${issue.lineId ?? index}`} className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn-600" />
                <span>
                  <span className="num text-xs opacity-60">{issue.code}</span> — {issue.message}
                </span>
              </li>
            ))}
          </ul>
          {readiness.issues.length > 12 ? (
            <p className="mt-2 text-xs text-slate-500">وتوجد {readiness.issues.length - 12} ملاحظة أخرى.</p>
          ) : null}
        </Card>
      ) : (
        <Alert tone="success" title="اليومية مكتملة وقابلة للاعتماد" />
      )}

      <Card title="سطور الشراء والتوزيع" actions={<span className="text-xs text-slate-500">الكمية بالأيام/السلة، والمبلغ = كمية × سعر السلة</span>}>
        <div className="table-scroll rounded-lg border border-border-subtle">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-surface text-xs text-slate-600">
              <tr>
                <th scope="col" className="sticky-start px-3 py-2 text-start">الصنف</th>
                <th scope="col" className="px-3 py-2 text-start">المورد</th>
                <th scope="col" className="px-3 py-2 text-start">الكمية</th>
                <th scope="col" className="px-3 py-2 text-start">سعر السلة 1</th>
                <th scope="col" className="px-3 py-2 text-start">حالة الشراء</th>
                <th scope="col" className="px-3 py-2 text-start">التوزيع / المتبقي</th>
                <th scope="col" className="px-3 py-2 text-start">حفظ</th>
              </tr>
            </thead>
            <tbody>
              {sheet.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    لا توجد سطور. أضف سطر شراء جديدًا أدناه.
                  </td>
                </tr>
              ) : null}
              {sheet.lines.map((line) => (
                <PurchaseLineRow
                  key={line.id}
                  revisionId={sheet.revision.id}
                  expectedVersion={sheet.sheet.version}
                  line={line}
                  products={products}
                  suppliers={suppliers}
                  stores={stores}
                  onSaved={onLineSaved}
                  onError={(message) => setError(message)}
                  onCancelRequested={(lineId) => {
                    setCancelTarget(lineId);
                    setCancelReason("");
                  }}
                />
              ))}
              {editable ? (
                <PurchaseLineRow
                  key={`new-${sheet.lines.length}-${sheet.sheet.version}`}
                  revisionId={sheet.revision.id}
                  expectedVersion={sheet.sheet.version}
                  line={null}
                  products={products}
                  suppliers={suppliers}
                  stores={stores}
                  onSaved={onLineSaved}
                  onError={(message) => setError(message)}
                />
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {cancelTarget ? (
        <Card title="إلغاء سطر شراء">
          <p className="mb-2 text-sm text-slate-600">
            الإلغاء يحتفظ بالسطر وأثره ولا يحذفه، ولا يدخل في الإجماليات. أكد بالسبب.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <input
              aria-label="سبب الإلغاء"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              className="min-w-64 flex-1 rounded-lg border-border-subtle px-3 py-2"
              placeholder="سبب الإلغاء (مطلوب)"
            />
            <button type="button" onClick={cancelLine} disabled={busy} className="rounded-lg bg-danger-600 px-3 py-2 text-sm font-semibold text-white">
              تأكيد الإلغاء
            </button>
            <button type="button" onClick={() => setCancelTarget(null)} className="rounded-lg border-border-subtle px-3 py-2 text-sm">
              تراجع
            </button>
          </div>
        </Card>
      ) : null}

      <Card title="إجراءات الحالة">
        <div className="flex flex-wrap items-center gap-2">
          {sheet.sheet.status === "draft" ? (
            <button
              type="button"
              onClick={submit}
              disabled={busy || !readiness?.ready}
              className="flex items-center gap-2 rounded-lg bg-green-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Send size={16} /> تقديم للمراجعة
            </button>
          ) : null}
          {canPost ? (
            <button
              type="button"
              onClick={post}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              <ShieldCheck size={16} /> اعتماد اليومية وترحيل القيود
            </button>
          ) : null}
          {sheet.sheet.status === "ready_for_review" && role === "worker" ? (
            <p className="flex items-center gap-2 text-sm text-warn-600">
              <Clock3 size={16} /> بانتظار اعتماد المدير. لا يمكن تعديل اليومية بعد التقديم.
            </p>
          ) : null}
          {sheet.sheet.status === "posted" || sheet.sheet.status === "closed" ? (
            <p className="text-sm text-slate-600">
              اليومية معتمدة. أي تعديل يتم من شاشة الأرشيف عبر إصدار تصحيح موثق.
            </p>
          ) : null}

        </div>
      </Card>
    </div>
  );
}
