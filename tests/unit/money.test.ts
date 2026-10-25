import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  formatMoney,
  formatQuantity,
  multiplyMoney,
  parseDecimal,
  subMoney,
  sumMoney,
} from "@/lib/money/decimal";

describe("حسابات الأموال العشرية", () => {
  it("يحسب 2.25 × 30.00 = 67.50 دون أخطاء عائمة", () => {
    expect(multiplyMoney("2.25", "30.00")).toBe("67.50");
    expect(multiplyMoney("2.25", 30)).toBe("67.50");
  });

  it("يحسب 0.25 × 40 = 10.00", () => {
    expect(multiplyMoney("0.25", "40.00")).toBe("10.00");
  });

  it("يعالج 1.5 × 36 = 54.00", () => {
    expect(multiplyMoney("1.5", "36.00")).toBe("54.00");
  });

  it("يقرب النصف للأعلى: 0.005 → 0.01", () => {
    expect(multiplyMoney("0.5", "10.01")).toBe("5.01");
    expect(multiplyMoney("0.25", "10.02")).toBe("2.51");
    expect(multiplyMoney("0.125", "0.1")).toBe("0.01");
  });

  it("يجمع ويطرح بدقة (0.1 + 0.2 = 0.30)", () => {
    expect(addMoney("0.1", "0.2")).toBe("0.30");
    expect(subMoney("133.50", "40.00")).toBe("93.50");
    expect(sumMoney(["37.50", "22.50", "9.00", "36.00"])).toBe("105.00");
  });

  it("يرفض القيم غير الرقمية أو الدقة الزائدة للمبالغ", () => {
    expect(() => parseDecimal("abc")).toThrow();
    expect(() => parseDecimal("1e5")).toThrow();
    expect(() => formatMoney("1.005")).toThrow();
    expect(() => formatQuantity("1.0005")).toThrow();
  });

  it("يقارن المبالغ ويعيد 0 عند التساوي", () => {
    expect(compareMoney("105.00", "105.0")).toBe(0);
    expect(compareMoney("105.01", "105.00")).toBe(1);
    expect(compareMoney("9.99", "10.00")).toBe(-1);
  });
});
