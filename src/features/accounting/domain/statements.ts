import { addMoney, subMoney, sumMoney } from "@/lib/money/decimal";

export interface LedgerRow {
  entryNo: number;
  date: string;
  kind: string;
  description: string | null;
  debit: string;
  credit: string;
  productName?: string | null;
  supplierName?: string | null;
  quantity?: string | null;
  unitCost?: string | null;
}

export interface Statement {
  partyId: string;
  from: string;
  to: string;
  openingBalance: string;
  totalCharges: string;
  totalPaid: string;
  closingBalance: string;
  rows: Array<LedgerRow & { runningBalance: string }>;
}

export type PartyKind = "store" | "supplier";

/**
 * يجمع كشف طرف من دفتر حركات. الرصيد الموجب:
 *  - البقالة: مبلغ مستحق عليها (debit − credit على 1100)
 *  - المورد: مبلغ مستحق له (credit − debit على 2100)
 */
export function buildStatement(params: {
  partyId: string;
  kind: PartyKind;
  from: string;
  to: string;
  openingBalance: string;
  rows: ReadonlyArray<LedgerRow>;
}): Statement {
  const signed = [...params.rows]
    .sort((a, b) => (a.date === b.date ? a.entryNo - b.entryNo : a.date < b.date ? -1 : 1))
    .map((row) => ({
      ...row,
      delta: params.kind === "store" ? subMoney(row.debit, row.credit) : subMoney(row.credit, row.debit),
    }));

  let running = params.openingBalance;
  const rows = signed.map((row) => {
    running = addMoney(running, row.delta);
    return { ...row, runningBalance: running };
  });

  const charges = params.kind === "store" ? sumMoney(params.rows.map((r) => r.debit)) : sumMoney(params.rows.map((r) => r.credit));
  const paid = params.kind === "store" ? sumMoney(params.rows.map((r) => r.credit)) : sumMoney(params.rows.map((r) => r.debit));

  return {
    partyId: params.partyId,
    from: params.from,
    to: params.to,
    openingBalance: params.openingBalance,
    totalCharges: charges,
    totalPaid: paid,
    closingBalance: subMoney(addMoney(params.openingBalance, charges), paid),
    rows,
  };
}

export function balanceDirectionLabel(kind: PartyKind, balance: string): string {
  const value = Number(balance);
  if (Math.abs(value) < 0.005) return "مسدد بالكامل";
  if (kind === "store") return value > 0 ? "مستحق على البقالة" : "رصيد لصالح البقالة";
  return value > 0 ? "مستحق للمورد" : "رصيد مدين على المورد";
}
