import { Card, StatCard } from "@/components/ui/primitives";
import { formatAmount, formatDate, formatQuantity } from "@/lib/format";

export interface StatementRow {
  entry_no: number | null;
  date: string;
  kind: string;
  description: string | null;
  product_name?: string | null;
  supplier_name?: string | null;
  quantity?: string | number | null;
  unit_cost?: string | number | null;
  unit_price?: string | number | null;
  debit: string | number;
  credit: string | number;
  balance: string | number;
}

export interface StatementData {
  from: string;
  to: string;
  opening_balance: string | number;
  total_charges: string | number;
  total_paid: string | number;
  total_purchases?: string | number;
  closing_balance: string | number;
  rows: StatementRow[];
}

export function StatementView({ statement, partyName, partyKind }: { statement: StatementData; partyName: string; partyKind: "store" | "supplier" }) {
  const charges = partyKind === "store" ? statement.total_charges : statement.total_purchases ?? statement.total_charges;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-brand-900">كشف {partyKind === "store" ? "بقالة" : "مورد"}: {partyName}</h1>
        <p className="text-sm text-slate-600">الفترة من {formatDate(statement.from)} إلى {formatDate(statement.to)}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="رصيد أول المدة" value={formatAmount(statement.opening_balance)} />
        <StatCard label={partyKind === "store" ? "إجمالي التحميلات" : "إجمالي المشتريات"} value={formatAmount(charges)} tone="green" />
        <StatCard label={partyKind === "store" ? "المقبوض" : "المدفوع"} value={formatAmount(statement.total_paid)} tone="gold" />
        <StatCard label="الرصيد الختامي" value={formatAmount(statement.closing_balance)} tone="violet" />
      </div>
      <Card title="حركات الدفتر" actions={<button type="button" onClick={() => window.print()} className="rounded-lg border border-border-subtle px-3 py-2 text-xs print:hidden">طباعة</button>}>
        {statement.rows.length === 0 ? <p className="py-5 text-center text-sm text-slate-500">لا توجد حركات خلال الفترة.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="border-b border-border-subtle bg-surface text-start text-xs text-slate-600"><tr>
                <th className="px-3 py-2 text-start">التاريخ</th><th className="px-3 py-2 text-start">رقم القيد</th><th className="px-3 py-2 text-start">البيان</th><th className="px-3 py-2 text-start">الصنف</th><th className="px-3 py-2 text-start">الكمية</th><th className="px-3 py-2 text-start">مدين</th><th className="px-3 py-2 text-start">دائن</th><th className="px-3 py-2 text-start">الرصيد الجاري</th>
              </tr></thead>
              <tbody>{statement.rows.map((row, index) => <tr key={`${row.entry_no}-${row.date}-${index}`} className="border-b border-border-subtle last:border-0">
                <td className="num px-3 py-2">{formatDate(row.date)}</td><td className="num px-3 py-2">{row.entry_no ?? "—"}</td><td className="px-3 py-2">{row.description ?? row.kind}</td><td className="px-3 py-2">{row.product_name ?? "—"}{row.supplier_name ? ` · ${row.supplier_name}` : ""}</td><td className="num px-3 py-2">{formatQuantity(row.quantity)}</td><td className="num px-3 py-2">{formatAmount(row.debit)}</td><td className="num px-3 py-2">{formatAmount(row.credit)}</td><td className="num px-3 py-2 font-semibold">{formatAmount(row.balance)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}