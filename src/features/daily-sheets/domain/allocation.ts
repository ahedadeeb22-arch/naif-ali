import {
  addMoney,
  compareMoney,
  multiplyMoney,
  parseDecimal,
  subMoney,
  sumMoney,
} from "@/lib/money/decimal";

export type PurchaseStatus = "purchased" | "cancelled" | "free_sample";
export type DispositionType = "store_distribution" | "inventory_remaining" | "damaged";

export interface PurchaseLineInput {
  id: string;
  productId: string;
  supplierId: string | null;
  status: PurchaseStatus;
  quantity: string;
  unitPrice: string | null;
  cancellationReason?: string | null;
  freeReason?: string | null;
}

export interface DispositionInput {
  lineId: string;
  type: DispositionType;
  storeId: string | null;
  quantity: string;
  reason?: string | null;
}

export interface LineCost {
  lineId: string;
  purchasedValue: string;
  distributedValue: string;
  distributedQuantity: string;
  inventoryQuantity: string;
  damagedQuantity: string;
  remainingQuantity: string;
}

export interface ReadinessIssue {
  code: string;
  lineId?: string;
  message: string;
}

export interface ReadinessResult {
  ready: boolean;
  issues: ReadinessIssue[];
  purchaseTotal: string;
  distributedTotal: string;
  inventoryTotal: string;
  damagedTotal: string;
  difference: string;
  lines: LineCost[];
}

/** يقرأ كمية بدقة 3 منازل مع رفض القيم الأدق. */
function quantityToMilli(value: string): bigint {
  const parts = parseDecimal(value);
  if (parts.scale > 3) {
    throw new Error(`الكمية تدعم 3 منازل عشرية فقط: ${value}`);
  }
  return parts.digits * 10n ** BigInt(3 - parts.scale);
}

function milliToQuantity(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const text = abs.toString().padStart(4, "0");
  return `${negative ? "-" : ""}${text.slice(0, text.length - 3)}.${text.slice(text.length - 3)}`;
}

/**
 * يحقق جاهزية اليومية بنفس قواعد دالة SQL check_revision_readiness.
 * القيمة المالية لكل تصرف = round(quantity × linePrice, 2) ثم تُجمع المبالغ المقرّبة.
 */
export function evaluateReadiness(
  lines: ReadonlyArray<PurchaseLineInput>,
  dispositions: ReadonlyArray<DispositionInput>,
): ReadinessResult {
  const issues: ReadinessIssue[] = [];
  const costs: LineCost[] = [];
  const purchaseValues: string[] = [];
  const distributedValues: string[] = [];
  const inventoryValues: string[] = [];
  const damagedValues: string[] = [];
  let activeLines = 0;

  for (const line of lines) {
    if (line.status === "cancelled") continue;
    activeLines += 1;

    const purchasedMilli = quantityToMilli(line.quantity);
    let distributedMilli = 0n;
    let inventoryMilli = 0n;
    let damagedMilli = 0n;

    for (const item of dispositions) {
      if (item.lineId !== line.id) continue;
      const milli = quantityToMilli(item.quantity);
      if (milli <= 0n) {
        issues.push({ code: "NON_POSITIVE_DISPOSITION", lineId: line.id, message: "كمية التوزيع يجب أن تكون أكبر من صفر" });
      }
      if (item.type === "store_distribution") {
        if (!item.storeId) {
          issues.push({ code: "STORE_REQUIRED", lineId: line.id, message: "توزيع البقالة يتطلب تحديد البقالة" });
        }
        distributedMilli += milli;
      } else if (item.type === "inventory_remaining") {
        inventoryMilli += milli;
      } else {
        if (!item.reason || item.reason.trim().length === 0) {
          issues.push({ code: "DAMAGE_REASON_REQUIRED", lineId: line.id, message: "سبب التلف مطلوب" });
        }
        damagedMilli += milli;
      }
    }

    if (line.status === "purchased" && !line.supplierId) {
      issues.push({ code: "SUPPLIER_REQUIRED", lineId: line.id, message: "المورد مطلوب للسطر المشترى" });
    }
    if (line.status === "purchased" && line.unitPrice === null) {
      issues.push({ code: "PRICE_REQUIRED", lineId: line.id, message: "السعر مطلوب للسطر المشترى" });
    }
    if (line.status === "purchased" && purchasedMilli <= 0n) {
      issues.push({ code: "QUANTITY_REQUIRED", lineId: line.id, message: "الكمية يجب أن تكون أكبر من صفر" });
    }
    if (line.status === "free_sample") {
      if (line.unitPrice !== "0.00" && line.unitPrice !== "0" && line.unitPrice !== "0.0") {
        issues.push({ code: "FREE_SAMPLE_HAS_PRICE", lineId: line.id, message: "السعر يجب أن يكون صفرًا للمجاني" });
      }
      if (!line.freeReason || line.freeReason.trim().length === 0) {
        issues.push({ code: "FREE_REASON_REQUIRED", lineId: line.id, message: "سبب المجاني مطلوب" });
      }
      if (distributedMilli + inventoryMilli + damagedMilli !== 0n) {
        issues.push({ code: "FREE_SAMPLE_DISPOSED", lineId: line.id, message: "لا يمكن توزيع/تصنيف سطر مجاني" });
      }
    }

    if (line.status === "purchased") {
      const allocated = distributedMilli + inventoryMilli + damagedMilli;
      if (allocated !== purchasedMilli) {
        issues.push({
          code: allocated < purchasedMilli ? "UNCLASSIFIED_QUANTITY" : "OVER_ALLOCATED_QUANTITY",
          lineId: line.id,
          message:
            allocated < purchasedMilli
              ? `الكمية غير مصنفة: متبقي ${milliToQuantity(purchasedMilli - allocated)}`
              : `التوزيع يتجاوز الكمية بـ ${milliToQuantity(allocated - purchasedMilli)}`,
        });
      }
      if (line.unitPrice !== null) {
        const unitPrice = line.unitPrice;
        purchaseValues.push(multiplyMoney(line.quantity, unitPrice));
        for (const item of dispositions) {
          if (item.lineId !== line.id) continue;
          const value = multiplyMoney(item.quantity, unitPrice);
          if (item.type === "store_distribution") distributedValues.push(value);
          else if (item.type === "inventory_remaining") inventoryValues.push(value);
          else damagedValues.push(value);
        }
      }
    }

    costs.push({
      lineId: line.id,
      purchasedValue: line.unitPrice === null ? "0.00" : multiplyMoney(line.quantity, line.unitPrice),
      distributedValue: sumMoney(
        dispositions
          .filter((item) => item.lineId === line.id && item.type === "store_distribution")
          .map((item) => multiplyMoney(item.quantity, line.unitPrice ?? "0")),
      ),
      distributedQuantity: milliToQuantity(distributedMilli),
      inventoryQuantity: milliToQuantity(inventoryMilli),
      damagedQuantity: milliToQuantity(damagedMilli),
      remainingQuantity: milliToQuantity(purchasedMilli - distributedMilli - inventoryMilli - damagedMilli),
    });
  }

  if (activeLines === 0) {
    issues.push({ code: "EMPTY_REVISION", message: "لا يوجد أي سطر شراء" });
  }

  const purchaseTotal = sumMoney(purchaseValues);
  const distributedTotal = sumMoney(distributedValues);
  const inventoryTotal = sumMoney(inventoryValues);
  const damagedTotal = sumMoney(damagedValues);
  const difference = subMoney(purchaseTotal, addMoney(addMoney(distributedTotal, inventoryTotal), damagedTotal));

  if (activeLines > 0 && compareMoney(difference, "0.00") !== 0) {
    issues.push({
      code: "COST_MISMATCH",
      message: `تكلفة الشراء ${purchaseTotal} لا تساوي التوزيع + المخزون + التلف`,
    });
  }

  return {
    ready: issues.length === 0,
    issues,
    purchaseTotal,
    distributedTotal,
    inventoryTotal,
    damagedTotal,
    difference,
    lines: costs,
  };
}



/** يحسب قيمة تحميل بقالة من مصدر شراء محدد. */
export function chargeForDistribution(quantity: string, sourceUnitPrice: string): string {
  return multiplyMoney(quantity, sourceUnitPrice);
}
