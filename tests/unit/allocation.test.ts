import { describe, expect, it } from "vitest";
import { evaluateReadiness, type DispositionInput, type PurchaseLineInput } from "@/features/daily-sheets/domain/allocation";

const bought = (overrides: Partial<PurchaseLineInput>): PurchaseLineInput => ({
  id: "line-1",
  productId: "tomato",
  supplierId: "amine",
  status: "purchased",
  quantity: "2",
  unitPrice: "30.00",
  ...overrides,
});

describe("جاهزية اليومية والتحقق من التكلفة", () => {
  it("T1 عدة أصناف من مورد واحد: توزيع كامل متوازن", () => {
    const lines = [
      bought({ id: "tomato-line", quantity: "2", unitPrice: "30" }),
      bought({ id: "potato-line", productId: "potato", quantity: "3", unitPrice: "20" }),
    ];
    const dispositions: DispositionInput[] = [
      { lineId: "tomato-line", type: "store_distribution", storeId: "s", quantity: "1" },
      { lineId: "tomato-line", type: "store_distribution", storeId: "h", quantity: "1" },
      { lineId: "potato-line", type: "store_distribution", storeId: "s", quantity: "1.5" },
      { lineId: "potato-line", type: "store_distribution", storeId: "suad", quantity: "1.5" },
    ];
    const result = evaluateReadiness(lines, dispositions);
    expect(result.ready).toBe(true);
    expect(result.purchaseTotal).toBe("120.00");
    expect(result.distributedTotal).toBe("120.00");
    expect(result.difference).toBe("0.00");
  });

  it("T2 موردان بسعرين مختلفين: التكلفة تتبع المصدر لا المتوسط", () => {
    const lines = [
      bought({ id: "amine", quantity: "2", unitPrice: "30" }),
      bought({ id: "fares", supplierId: "fares", quantity: "1.5", unitPrice: "36" }),
    ];
    const dispositions: DispositionInput[] = [
      { lineId: "amine", type: "store_distribution", storeId: "s", quantity: "1.25" },
      { lineId: "amine", type: "store_distribution", storeId: "h", quantity: "0.75" },
      { lineId: "fares", type: "store_distribution", storeId: "s", quantity: "1" },
      { lineId: "fares", type: "store_distribution", storeId: "suad", quantity: "0.25" },
      { lineId: "fares", type: "inventory_remaining", storeId: null, quantity: "0.25" },
    ];
    const result = evaluateReadiness(lines, dispositions);
    expect(result.ready).toBe(true);
    expect(result.purchaseTotal).toBe("114.00");
    expect(result.distributedTotal).toBe("105.00");
    expect(result.inventoryTotal).toBe("9.00");
    const amine = result.lines.find((l) => l.lineId === "amine");
    const fares = result.lines.find((l) => l.lineId === "fares");
    expect(amine?.distributedValue).toBe("60.00");
    expect(fares?.distributedValue).toBe("45.00");
    expect(fares?.remainingQuantity).toBe("0.000");
  });

  it("T3 توزيع كسري 0.25 / 0.5 / 1.0 مع متبقٍ", () => {
    const result = evaluateReadiness(
      [bought({ quantity: "2", unitPrice: "40" })],
      [
        { lineId: "line-1", type: "store_distribution", storeId: "s", quantity: "0.25" },
        { lineId: "line-1", type: "store_distribution", storeId: "h", quantity: "0.5" },
        { lineId: "line-1", type: "store_distribution", storeId: "suad", quantity: "1" },
        { lineId: "line-1", type: "inventory_remaining", storeId: null, quantity: "0.25" },
      ],
    );
    expect(result.ready).toBe(true);
    expect(result.distributedTotal).toBe("70.00");
    expect(result.inventoryTotal).toBe("10.00");
  });

  it("T4 شراء غير موزع بالكامل: التلف والمخزون يفسران التكلفة", () => {
    const result = evaluateReadiness(
      [bought({ quantity: "5", unitPrice: "12" })],
      [
        { lineId: "line-1", type: "store_distribution", storeId: "s", quantity: "3" },
        { lineId: "line-1", type: "inventory_remaining", storeId: null, quantity: "1" },
        { lineId: "line-1", type: "damaged", storeId: null, quantity: "1", reason: "تلف بالنقل" },
      ],
    );
    expect(result.ready).toBe(true);
    expect(result.purchaseTotal).toBe("60.00");
    expect(result.distributedTotal).toBe("36.00");
    expect(result.inventoryTotal).toBe("12.00");
    expect(result.damagedTotal).toBe("12.00");
  });

  it("T4b بقاء كمية غير مصنفة يمنع الجاهزية", () => {
    const result = evaluateReadiness(
      [bought({ quantity: "5", unitPrice: "12" })],
      [{ lineId: "line-1", type: "store_distribution", storeId: "s", quantity: "3" }],
    );
    expect(result.ready).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("UNCLASSIFIED_QUANTITY");
  });

  it("T5 السعر الفارغ يمنع، الصفر يحتاج وسم مجاني، الملغى لا يدخل", () => {
    const nullPrice = evaluateReadiness(
      [bought({ supplierId: null, unitPrice: null })],
      [],
    );
    expect(nullPrice.ready).toBe(false);
    expect(nullPrice.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["SUPPLIER_REQUIRED", "PRICE_REQUIRED", "UNCLASSIFIED_QUANTITY"]),
    );

    const freeWithoutReason = evaluateReadiness(
      [bought({ status: "free_sample", unitPrice: "0", quantity: "2", freeReason: null })],
      [],
    );
    expect(freeWithoutReason.issues.map((i) => i.code)).toContain("FREE_REASON_REQUIRED");

    const cancelled = evaluateReadiness(
      [bought({ status: "cancelled", unitPrice: null, quantity: "2", cancellationReason: "لم يتوفر" })],
      [],
    );
    expect(cancelled.ready).toBe(false);
    expect(cancelled.issues.map((i) => i.code)).toContain("EMPTY_REVISION");
    expect(cancelled.purchaseTotal).toBe("0.00");
  });

  it("يرفض التوزيع الذي يتجاوز المصدر", () => {
    const result = evaluateReadiness(
      [bought({ quantity: "1" })],
      [
        { lineId: "line-1", type: "store_distribution", storeId: "s", quantity: "0.75" },
        { lineId: "line-1", type: "store_distribution", storeId: "h", quantity: "0.5" },
      ],
    );
    expect(result.ready).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("OVER_ALLOCATED_QUANTITY");
  });

  it("يرفض التلف دون سبب", () => {
    const result = evaluateReadiness(
      [bought({ quantity: "1" })],
      [
        { lineId: "line-1", type: "store_distribution", storeId: "s", quantity: "0.5" },
        { lineId: "line-1", type: "damaged", storeId: null, quantity: "0.5" },
      ],
    );
    expect(result.issues.map((i) => i.code)).toContain("DAMAGE_REASON_REQUIRED");
  });
});
