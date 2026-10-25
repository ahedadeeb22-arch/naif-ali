/**
 * حساب عشري دقيق (Decimal) بلا اعتماد على Float.
 * الكمية 3 منازل، المال منزلتان. يُستخدم في الواجهة وفي الاختبارات فقط؛
 * القيمة النهائية المُرحّلة تُحسب داخل PostgreSQL (numeric).
 */

export class DecimalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecimalError";
  }
}

export interface DecimalParts {
  digits: bigint;
  scale: number;
}

/** يقرأ نصًا/رقمًا ويحوله لعشري ثابت بدون تقريب صامت. */
export function parseDecimal(input: string | number): DecimalParts {
  const raw = typeof input === "number" ? numberToPlainString(input) : input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new DecimalError(`قيمة رقمية غير صالحة: ${String(input)}`);
  }
  const negative = raw.startsWith("-");
  const [intPart = "0", fracPart = ""] = raw.replace("-", "").split(".");
  const digits = BigInt(`${intPart === "" ? "0" : intPart}${fracPart}`);
  return { digits: negative ? -digits : digits, scale: fracPart.length };
}

/** يقرأ رقمًا جافاسكربتي بأمان (24.7.3e-5 يرفض). */
function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) throw new DecimalError("قيمة غير منتهية");
  const text = String(value);
  if (/e/i.test(text)) throw new DecimalError("استخدم نصًا عشريًا للقيم العلمية");
  return text;
}

function scaleTo(parts: DecimalParts, scale: number): bigint {
  if (parts.scale > scale) {
    throw new DecimalError(`فقدان دقة: ${parts.digits} بمقياس ${parts.scale} > ${scale}`);
  }
  return parts.digits * 10n ** BigInt(scale - parts.scale);
}

/** جمع/طرح المكتنفات لمنزلتين. */
export function addMoney(a: string | number, b: string | number): string {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  const digits = scaleTo(pa, 2) + scaleTo(pb, 2);
  return formatParts(digits, 2);
}

export function subMoney(a: string | number, b: string | number): string {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  return formatParts(scaleTo(pa, 2) - scaleTo(pb, 2), 2);
}

/**
 * ضرب كمية بسعر وحدة وتقريب الناتج إلى منزلتين (ROUND_HALF_UP, من بعيد عن الصفر).
 * نفس دلالة round(numeric, 2) في PostgreSQL للأرقام الموجبة.
 */
export function multiplyMoney(quantity: string | number, unitPrice: string | number): string {
  const q = parseDecimal(quantity);
  const p = parseDecimal(unitPrice);
  const product = q.digits * p.digits;
  const scale = q.scale + p.scale;
  if (scale <= 2) return formatParts(product * 10n ** BigInt(2 - scale), 2);

  const divisor = 10n ** BigInt(scale - 2);
  const negative = product < 0n;
  const absolute = negative ? -product : product;
  const quotient = absolute / divisor;
  const remainder = absolute % divisor;
  const up = remainder * 2n >= divisor;
  const rounded = (quotient + (up ? 1n : 0n)) * (negative ? -1n : 1n);
  return formatParts(rounded, 2);
}

export function sumMoney(values: ReadonlyArray<string | number>): string {
  return values.reduce<string>((acc, value) => addMoney(acc, value), "0.00");
}

export function compareMoney(a: string | number, b: string | number): number {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);
  const diff = scaleTo(pa, 2) - scaleTo(pb, 2);
  return diff === 0n ? 0 : diff > 0n ? 1 : -1;
}

/** تنسيق عشري ثابت مع الفواصل الثلاثية (لا يعتمد على Intl للاتساق). */
export function formatParts(digits: bigint, scale: number): string {
  const negative = digits < 0n;
  const absolute = negative ? -digits : digits;
  const padded = absolute.toString().padStart(scale + 1, "0");
  const intPart = padded.slice(0, padded.length - scale) || "0";
  const fracPart = scale > 0 ? `.${padded.slice(padded.length - scale)}` : "";
  return `${negative ? "-" : ""}${intPart}${fracPart}`;
}

/** إعادة تنسيق نص عشري إلى 3 منازل كحد أقصى للكميات. */
export function formatQuantity(value: string | number): string {
  const parts = parseDecimal(value);
  if (parts.scale > 3) throw new DecimalError("الكمية تدعم 3 منازل عشرية فقط");
  return formatParts(parts.digits, 3);
}

/** إعادة تنسيق مبلغ إلى منزلتين؛ يرفض أكثر منزلتين. */
export function formatMoney(value: string | number): string {
  const parts = parseDecimal(value);
  if (parts.scale > 2) throw new DecimalError("المبلغ يدعم منزلتين عشريتين فقط");
  return formatParts(parts.digits, 2);
}
