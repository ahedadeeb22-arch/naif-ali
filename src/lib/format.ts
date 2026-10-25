import { APP } from "@/lib/config";

const arabicDate = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return arabicDate.format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: APP.timezone,
  }).format(date);
}

/** يعرض المبلغ من دفتر PostgreSQL كسلسلة numeric؛ لا تحويل float. */
export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const text = typeof value === "number" ? value.toFixed(2) : value;
  const [rawInt = "0", frac = "00"] = text.split(".");
  const negative = rawInt.startsWith("-");
  const intPart = negative ? rawInt.slice(1) : rawInt;
  const digits = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${digits || "0"}.${frac.padEnd(2, "0").slice(0, 2)} ${APP.currency}`;
}

export function formatQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "number" ? value.toFixed(3) : value;
  const trimmed = number.replace(/\.?0+$/, "");
  return trimmed === "" ? "0" : trimmed;
}
