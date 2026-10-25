import { describe, expect, it } from "vitest";
import { balanceDirectionLabel, buildStatement } from "@/features/accounting/domain/statements";

describe("كشوف الحساب", () => {
  it("رصيد البقالة: افتتاحي 100 + تحميل 73.50 − قبض 40 = 133.50", () => {
    const statement = buildStatement({
      partyId: "store-s",
      kind: "store",
      from: "2026-01-01",
      to: "2026-01-31",
      openingBalance: "100.00",
      rows: [
        { entryNo: 1, date: "2026-01-10", kind: "store_charge", description: "تحميل", debit: "73.50", credit: "0.00" },
        { entryNo: 2, date: "2026-01-11", kind: "store_receipt", description: "قبض", debit: "0.00", credit: "40.00" },
      ],
    });
    expect(statement.totalCharges).toBe("73.50");
    expect(statement.totalPaid).toBe("40.00");
    expect(statement.closingBalance).toBe("133.50");
    expect(statement.rows.at(-1)?.runningBalance).toBe("133.50");
    expect(balanceDirectionLabel("store", "133.50")).toContain("مستحق على");
  });

  it("رصيد المورد: 20 + 114 − 50 = 84", () => {
    const statement = buildStatement({
      partyId: "supplier-amine",
      kind: "supplier",
      from: "2026-01-01",
      to: "2026-01-31",
      openingBalance: "20.00",
      rows: [
        { entryNo: 10, date: "2026-01-10", kind: "purchase", description: "مشتريات", debit: "0.00", credit: "114.00" },
        { entryNo: 11, date: "2026-01-12", kind: "supplier_payment", description: "صرف", debit: "50.00", credit: "0.00" },
      ],
    });
    expect(statement.closingBalance).toBe("84.00");
    expect(statement.totalCharges).toBe("114.00");
    expect(statement.totalPaid).toBe("50.00");
    expect(balanceDirectionLabel("supplier", "84.00")).toContain("مستحق للمورد");
  });

  it("يحتسب الرصيد الجاري بالتسلسل الزمني حتى مع ترتيب مُدخل معكوس", () => {
    const statement = buildStatement({
      partyId: "store-h",
      kind: "store",
      from: "2026-02-01",
      to: "2026-02-28",
      openingBalance: "0.00",
      rows: [
        { entryNo: 5, date: "2026-02-03", kind: "store_receipt", description: "قبض", debit: "0.00", credit: "10.00" },
        { entryNo: 4, date: "2026-02-01", kind: "store_charge", description: "تحميل", debit: "20.00", credit: "0.00" },
        { entryNo: 6, date: "2026-02-05", kind: "store_charge", description: "تحميل", debit: "5.00", credit: "0.00" },
      ],
    });
    expect(statement.rows.map((r) => r.runningBalance)).toEqual(["20.00", "10.00", "15.00"]);
    expect(statement.closingBalance).toBe("15.00");
  });
});
