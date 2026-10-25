"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { callRpc } from "@/lib/rpc";
import type { MutationResult } from "@/features/daily-sheets/action-types";

const uuid = z.string().uuid();

const lineInput = z.object({
  id: uuid.optional(),
  product_id: uuid,
  supplier_id: uuid.nullable(),
  purchase_status: z.enum(["purchased", "cancelled", "free_sample"]),
  purchased_quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, "كمية غير صالحة"),
  basket_unit_price: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, "سعر غير صالح")
    .nullable(),
  note: z.string().max(500).nullable().optional(),
  cancellation_reason: z.string().max(500).nullable().optional(),
  free_reason: z.string().max(500).nullable().optional(),
});

const dispositionInput = z.object({
  disposition_type: z.enum(["store_distribution", "inventory_remaining", "damaged"]),
  store_id: uuid.nullable(),
  quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, "كمية توزيع غير صالحة"),
  reason: z.string().max(500).nullable().optional(),
});



function normalizeLine(raw: z.infer<typeof lineInput>) {
  const isCancelled = raw.purchase_status === "cancelled";
  return {
    id: raw.id ?? null,
    product_id: raw.product_id,
    supplier_id: raw.supplier_id,
    purchase_status: raw.purchase_status,
    purchased_quantity: raw.purchased_quantity,
    basket_unit_price: isCancelled ? null : raw.basket_unit_price,
    note: raw.note ?? null,
    cancellation_reason: raw.cancellation_reason ?? null,
    free_reason: raw.free_reason ?? null,
  };
}

export async function saveLineAction(input: unknown): Promise<MutationResult<{ lineId: string; version: number }>> {
  const parsed = z
    .object({ revisionId: uuid, expectedVersion: z.number().int().nonnegative(), line: lineInput })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "بيانات السطر غير صالحة" };

  try {
    await requireRole(["admin", "worker"]);
    const supabase = await createServerSupabase();
    const result = await callRpc<{ line_id: string; version: number }>(
      supabase,
      "save_purchase_line",
      {
        p_revision_id: parsed.data.revisionId,
        p_expected_version: parsed.data.expectedVersion,
        p_line: normalizeLine(parsed.data.line),
      },
    );
    return { ok: true, data: { lineId: result.line_id, version: result.version } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر حفظ السطر" };
  }
}

export async function saveDispositionsAction(
  input: unknown,
): Promise<MutationResult<{ version: number; remaining: string }>> {
  const parsed = z
    .object({
      lineId: uuid,
      expectedVersion: z.number().int().nonnegative(),
      dispositions: z.array(dispositionInput),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "بيانات التوزيع غير صالحة" };

  try {
    await requireRole(["admin", "worker"]);
    const supabase = await createServerSupabase();
    const result = await callRpc<{
      allocated_quantity: string | number;
      remaining_quantity: string | number;
      version: number;
    }>(supabase, "replace_line_dispositions", {
      p_line_id: parsed.data.lineId,
      p_expected_version: parsed.data.expectedVersion,
      p_dispositions: parsed.data.dispositions.map((item) => ({
        ...item,
        reason: item.reason ?? null,
      })),
    });
    return {
      ok: true,
      data: { version: result.version, remaining: String(result.remaining_quantity) },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر حفظ التوزيع" };
  }
}

export async function cancelLineAction(
  input: unknown,
): Promise<MutationResult<{ version: number }>> {
  const parsed = z
    .object({ lineId: uuid, expectedVersion: z.number().int().nonnegative(), reason: z.string().min(1).max(500) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "سبب الإلغاء مطلوب (حتى 500 حرف)" };

  try {
    await requireRole(["admin", "worker"]);
    const supabase = await createServerSupabase();
    const result = await callRpc<{ version: number }>(supabase, "cancel_purchase_line", {
      p_line_id: parsed.data.lineId,
      p_expected_version: parsed.data.expectedVersion,
      p_reason: parsed.data.reason,
    });
    return { ok: true, data: { version: result.version } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر إلغاء السطر" };
  }
}

export async function submitAction(
  input: unknown,
): Promise<MutationResult<{ status: string; version: number }>> {
  const parsed = z.object({ revisionId: uuid, expectedVersion: z.number().int().nonnegative() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "طلب غير صالح" };

  try {
    await requireRole(["admin", "worker"]);
    const supabase = await createServerSupabase();
    const result = await callRpc<{ status: string; version: number }>(supabase, "submit_revision", {
      p_revision_id: parsed.data.revisionId,
      p_expected_version: parsed.data.expectedVersion,
    });
    return { ok: true, data: { status: result.status, version: result.version } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر تقديم اليومية" };
  }
}

export async function postAction(
  input: unknown,
): Promise<MutationResult<{ status: string; journalEntryId: string; purchaseTotal: string }>> {
  const parsed = z
    .object({
      revisionId: uuid,
      expectedVersion: z.number().int().nonnegative(),
      idempotencyKey: z.string().min(8).max(120),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "طلب ترحيل غير صالح" };

  try {
    await requireRole(["admin"]);
    const supabase = await createServerSupabase();
    const result = await callRpc<{
      status: string;
      journal_entry_id: string;
      purchase_total: string | number;
    }>(supabase, "post_revision", {
      p_revision_id: parsed.data.revisionId,
      p_expected_version: parsed.data.expectedVersion,
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    return {
      ok: true,
      data: {
        status: result.status,
        journalEntryId: result.journal_entry_id,
        purchaseTotal: String(result.purchase_total),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر اعتماد اليومية" };
  }
}

export async function postCorrectionAction(
  input: unknown,
): Promise<MutationResult<{ status: string; journalEntryId: string; purchaseTotal: string }>> {
  const parsed = z.object({
    revisionId: uuid,
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(120),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "طلب تصحيح غير صالح" };

  try {
    await requireRole(["admin"]);
    const supabase = await createServerSupabase();
    const result = await callRpc<{
      status: string;
      journal_entry_id: string;
      purchase_total: string | number;
    }>(supabase, "post_correction", {
      p_revision_id: parsed.data.revisionId,
      p_expected_version: parsed.data.expectedVersion,
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    return {
      ok: true,
      data: {
        status: result.status,
        journalEntryId: result.journal_entry_id,
        purchaseTotal: String(result.purchase_total),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر ترحيل التصحيح" };
  }
}

export async function quickSavePurchaseLineAndDispositionsAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
  lineId?: string;
  version?: number;
}> {
  const parsed = z
    .object({
      revisionId: z.string().uuid(),
      expectedVersion: z.number().int().nonnegative(),
      line: z.object({
        id: z.string().uuid().optional().nullable(),
        product_id: z.string().uuid(),
        supplier_id: z.string().uuid().optional().nullable(),
        purchase_status: z.enum(["purchased", "cancelled", "free_sample"]),
        purchased_quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/),
        basket_unit_price: z
          .string()
          .regex(/^\d{1,9}(\.\d{1,2})?$/)
          .optional()
          .nullable(),
        note: z.string().max(500).optional().nullable(),
        cancellation_reason: z.string().max(500).optional().nullable(),
      }),
      dispositions: z.array(
        z.object({
          store_id: z.string().uuid().optional().nullable(),
          quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/),
          disposition_type: z.enum(["store_distribution", "inventory_remaining", "damaged"]),
          reason: z.string().max(500).optional().nullable(),
        }),
      ),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "بيانات سطر الشراء غير صالحة" };
  }

  try {
    await requireRole(["admin", "worker"]);
    const client = await createServerSupabase();
    const { revisionId, expectedVersion, line, dispositions } = parsed.data;

    // 1. حفظ السطر
    const lineRes = await callRpc<{ line_id: string; version: number }>(
      client,
      "save_purchase_line",
      {
        p_revision_id: revisionId,
        p_expected_version: expectedVersion,
        p_line: {
          id: line.id ?? null,
          product_id: line.product_id,
          supplier_id: line.supplier_id ?? null,
          purchase_status: line.purchase_status,
          purchased_quantity: line.purchased_quantity,
          basket_unit_price: line.basket_unit_price ?? null,
          note: line.note ?? null,
          cancellation_reason: line.cancellation_reason ?? null,
          free_reason: null,
        },
      },
    );

    let nextVersion = lineRes.version;

    // 2. إذا كانت هناك توزيعات وسعر محدد، يتم حفظ التوزيعات
    if (
      line.purchase_status === "purchased" &&
      line.basket_unit_price &&
      dispositions.length > 0
    ) {
      const validDisps = dispositions.filter((d) => Number(d.quantity) > 0);
      if (validDisps.length > 0) {
        const dispRes = await callRpc<{ version: number }>(
          client,
          "replace_line_dispositions",
          {
            p_line_id: lineRes.line_id,
            p_expected_version: nextVersion,
            p_dispositions: validDisps.map((d) => ({
              disposition_type: d.disposition_type,
              store_id: d.store_id ?? null,
              quantity: d.quantity,
              unit_cost: line.basket_unit_price,
              reason: d.reason ?? null,
            })),
          },
        );
        nextVersion = dispRes.version;
      }
    }

    revalidatePath("/worker/sheets");
    revalidatePath("/admin/sheets");

    return {
      ok: true,
      message: "تم حفظ السطر بنجاح",
      lineId: lineRes.line_id,
      version: nextVersion,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "تعذر حفظ السطر",
    };
  }
}
