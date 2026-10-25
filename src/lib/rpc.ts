import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

export type RpcClient = SupabaseClient<Database>;

export class RpcError extends Error {
  readonly code: string | null;
  readonly raw: string;

  constructor(message: string, code: string | null = null, raw = "") {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.raw = raw;
  }
}

const conflictCodes = new Set(["40001", "23P01", "23505"]);
const forbiddenCodes = new Set(["42501"]);

/**
 * ينفذ وظيفة قاعدة بيانات مالية ويعيد رسالة عربية مفهومة.
 * دالة SQL تتحقق من الصلاحية والنسخة والمجاميع؛ لا نعيد تنفيذ منطقها هنا.
 */
export async function callRpc<T>(
  client: RpcClient,
  name: string,
  args: Record<string, Json | undefined> = {},
): Promise<T> {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) {
    const raw = error.message ?? "";
    if (raw.includes("CONFLICT_VERSION") || conflictCodes.has(error.code ?? "")) {
      throw new RpcError("تم تعديل البيانات من مستخدم آخر. أعد تحميل اليومية قبل الحفظ.", "CONFLICT_VERSION", raw);
    }
    if (raw.includes("READINESS_FAILED")) {
      throw new RpcError("اليومية غير مكتملة. راجع الأخطاء المحددة في القائمة.", "READINESS_FAILED", raw);
    }
    if (raw.includes("ALREADY_POSTED")) {
      throw new RpcError("هذا الإصدار معتمد مسبقًا ولا يمكن ترحيله مرة أخرى.", "ALREADY_POSTED", raw);
    }
    if (forbiddenCodes.has(error.code ?? "")) {
      throw new RpcError("لا تملك صلاحية تنفيذ هذه العملية.", "FORBIDDEN", raw);
    }
    throw new RpcError(error.message || "تعذر تنفيذ العملية على الخادم.", error.code ?? null, raw);
  }
  return data as T;
}

/** يولد مفتاح idempotency مرة واحدة للمحاولة المنطقية (لا يتغير عند retry). */
export function newIdempotencyKey(prefix = "op"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
