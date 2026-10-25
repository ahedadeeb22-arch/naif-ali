import { APP } from "@/lib/config";

/** تاريخ العمل الحالي حسب المنطقة الزمنية المعتمدة (لا يعتمد على توقيت المتصفح). */
export function businessDate(now: Date = new Date(), timezone: string = APP.timezone): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** نطاق شامل الطرفين بالتواريخ. */
export function assertDateRange(from: string, to: string): void {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error("صيغة التاريخ يجب أن تكون YYYY-MM-DD");
  }
  if (from > to) {
    throw new Error("تاريخ البداية يجب ألا يتجاوز تاريخ النهاية");
  }
}

export function invoiceNumber(prefix: string, sequence: number, date: string): string {
  const compact = date.replaceAll("-", "").slice(0, 6);
  return `${prefix}-${compact}-${String(sequence).padStart(4, "0")}`;
}
