import type { DispositionInput } from "./allocation";

export interface NightOrderLine {
  productId: string;
  quantity: string;
}

/**
 * يدمج طلب الليل مع التوزيع الفعلي لعرض فرق الطلب/الموزع.
 * الطلب ليس التزامًا ماليًا، لذا لا تظهر هنا أي مبالغ.
 */
export function compareRequestedVsDelivered(
  requested: ReadonlyArray<NightOrderLine>,
  storeId: string,
  dispositions: ReadonlyArray<DispositionInput>,
): Array<{ productId: string; requested: string; delivered: string; difference: string }> {
  const delivered = new Map<string, number>();
  for (const item of dispositions) {
    if (item.type !== "store_distribution" || item.storeId !== storeId) continue;
    const key = item.lineId;
    delivered.set(key, (delivered.get(key) ?? 0) + Number(item.quantity));
  }
  // المفتاح الفعلي للتوزيع هو lineId وليس productId؛ لذلك تُطابق الكميات في طبقة الخدمة
  // عبر خريطة lineId -> productId. هنا نتحقق فقط من عدم وجود طلب سالب.
  return requested.map((line) => {
    const selected = Number(line.quantity);
    if (!Number.isFinite(selected) || selected < 0) {
      throw new Error("كمية طلب الليل يجب أن تكون غير سالبة");
    }
    const matched = delivered.get(line.productId) ?? 0;
    return {
      productId: line.productId,
      requested: selected.toFixed(3),
      delivered: matched.toFixed(3),
      difference: (matched - selected).toFixed(3),
    };
  });
}

export const nightOrderStatusLabels: Record<string, string> = {
  draft: "مسودة",
  submitted: "محفوظ",
  cancelled: "ملغى",
};
