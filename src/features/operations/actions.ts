"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { callRpc } from "@/lib/rpc";

const uuid = z.string().uuid();

export type OperationResult = { ok: true; message: string } | { ok: false; message: string };

export async function saveNightOrderAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    storeId: uuid,
    lines: z.array(z.object({ product_id: uuid, quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/), note: z.string().max(300).nullable() })),
    submit: z.boolean(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "بيانات الطلب غير صالحة" };

  try {
    await requireRole(["admin", "worker"]);
    const client = await createServerSupabase();
    await callRpc(client, "upsert_night_order", {
      p_business_date: parsed.data.date,
      p_store_id: parsed.data.storeId,
      p_lines: parsed.data.lines,
      p_submit: parsed.data.submit,
    });
    revalidatePath("/admin/night-orders");
    revalidatePath("/worker/night-orders");
    revalidatePath("/worker");
    return { ok: true, message: parsed.data.submit ? "تم حفظ الطلب وإرساله" : "تم حفظ الطلب" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر حفظ الطلب" };
  }
}

export async function createVoucherAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({
    type: z.enum(["receipt_from_store", "payment_to_supplier"]),
    storeId: uuid.nullable(),
    supplierId: uuid.nullable(),
    amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.string().max(80).nullable(),
    reference: z.string().max(120).nullable(),
    memo: z.string().max(500).nullable(),
    idempotencyKey: z.string().min(8).max(120),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "بيانات السند غير صالحة" };

  try {
    await requireRole(["admin"]);
    const client = await createServerSupabase();
    await callRpc(client, "create_and_post_voucher", {
      p_type: parsed.data.type,
      p_store_id: parsed.data.storeId,
      p_supplier_id: parsed.data.supplierId,
      p_amount: parsed.data.amount,
      p_effective_date: parsed.data.date,
      p_method: parsed.data.method,
      p_reference_no: parsed.data.reference,
      p_memo: parsed.data.memo,
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    revalidatePath("/admin/vouchers");
    revalidatePath("/admin/statements/stores");
    revalidatePath("/admin/statements/suppliers");
    revalidatePath("/portal");
    return { ok: true, message: "تم ترحيل السند" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر ترحيل السند" };
  }
}

export async function reverseVoucherAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({ voucherId: uuid, reason: z.string().trim().min(1).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "سبب العكس مطلوب" };
  try {
    await requireRole(["admin"]);
    const client = await createServerSupabase();
    await callRpc(client, "reverse_voucher", { p_voucher_id: parsed.data.voucherId, p_reason: parsed.data.reason });
    revalidatePath("/admin/vouchers");
    revalidatePath("/admin/statements/stores");
    revalidatePath("/admin/statements/suppliers");
    revalidatePath("/portal");
    return { ok: true, message: "تم عكس السند بقيد مرتبط" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر عكس السند" };
  }
}

export async function postOpeningBalanceAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({
    partyType: z.enum(["store", "supplier"]),
    storeId: uuid.nullable(),
    supplierId: uuid.nullable(),
    amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().min(8).max(120),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "بيانات الرصيد الافتتاحي غير صالحة" };
  try {
    await requireRole(["admin"]);
    const client = await createServerSupabase();
    await callRpc(client, "post_opening_balance", {
      p_party_type: parsed.data.partyType,
      p_store_id: parsed.data.partyType === "store" ? parsed.data.storeId : null,
      p_supplier_id: parsed.data.partyType === "supplier" ? parsed.data.supplierId : null,
      p_amount: parsed.data.amount,
      p_cutoff_date: parsed.data.date,
      p_reason: parsed.data.reason,
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    revalidatePath("/admin/opening");
    revalidatePath("/admin/statements/stores");
    revalidatePath("/admin/statements/suppliers");
    revalidatePath("/portal");
    return { ok: true, message: "تم ترحيل الرصيد الافتتاحي" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر ترحيل الرصيد" };
  }
}

export async function reopenSheetAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({ sheetId: uuid, expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(5).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "أدخل سبب التعديل (5 أحرف على الأقل)" };
  try {
    await requireRole(["admin"]);
    const client = await createServerSupabase();
    await callRpc(client, "reopen_for_correction", {
      p_sheet_id: parsed.data.sheetId,
      p_expected_version: parsed.data.expectedVersion,
      p_reason: parsed.data.reason,
    });
    revalidatePath("/admin/archive");
    revalidatePath("/admin/sheets");
    return { ok: true, message: "تم فتح إصدار تصحيح جديد" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر فتح التعديل" };
  }
}

export async function saveCatalogRecordAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({
    entity: z.enum(["stores", "suppliers", "products"]),
    id: uuid.nullable(),
    code: z.string().trim().max(20).nullable(),
    name: z.string().trim().min(1).max(120),
    sortOrder: z.number().int().min(0).max(100000).nullable(),
    unitName: z.string().trim().min(1).max(40).nullable(),
    notes: z.string().max(500).nullable(),
    active: z.boolean(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "بيانات السجل غير صالحة" };
  try {
    await requireRole(["admin"]);
    const client = await createServerSupabase();
    const { entity, id, code, name, sortOrder, unitName, notes, active } = parsed.data;
    const values = entity === "stores"
      ? { code: code ?? "", name, sort_order: sortOrder ?? 100, active }
      : entity === "suppliers"
        ? { code, name, notes, active }
        : { code, name, unit_name: unitName ?? "سلة", sort_order: sortOrder ?? 100, active };
    const result = id
      ? await client.from(entity).update(values as never).eq("id", id)
      : await client.from(entity).insert(values as never);
    if (result.error) throw new Error("تعذر حفظ السجل. تحقق من عدم تكرار الرمز أو الاسم.");
    revalidatePath(`/admin/${entity}`);
    revalidatePath("/admin/sheets");
    revalidatePath("/admin/night-orders");
    return { ok: true, message: "تم حفظ السجل" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر حفظ السجل" };
  }
}

export async function updateProfileAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({ userId: uuid, displayName: z.string().trim().min(1).max(120), role: z.enum(["admin", "worker", "store_owner"]), active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "بيانات المستخدم غير صالحة" };
  try {
    const admin = await requireRole(["admin"]);
    if (admin.userId === parsed.data.userId && (parsed.data.role !== "admin" || !parsed.data.active)) {
      return { ok: false, message: "لا يمكن تعطيل حسابك أو تغيير دورك من هذه الصفحة" };
    }
    const client = await createServerSupabase();
    const profileUpdate = { display_name: parsed.data.displayName, role: parsed.data.role, active: parsed.data.active };
    const { error } = await client.from("profiles").update(profileUpdate as never).eq("user_id", parsed.data.userId);
    if (error) throw new Error("تعذر تحديث ملف المستخدم");
    revalidatePath("/admin/users");
    return { ok: true, message: "تم تحديث المستخدم" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر تحديث المستخدم" };
  }
}

export async function setStoreMembershipAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({ userId: uuid, storeId: uuid, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "بيانات العضوية غير صالحة" };
  try {
    const admin = await requireRole(["admin"]);
    const client = await createServerSupabase();
    const membership = { user_id: parsed.data.userId, store_id: parsed.data.storeId, active: parsed.data.active, created_by: admin.userId };
    const { error } = await client.from("store_memberships").upsert(membership as never, { onConflict: "user_id,store_id" });
    if (error) throw new Error("تعذر تحديث عضوية البقالة");
    revalidatePath("/admin/users");
    revalidatePath("/portal");
    return { ok: true, message: "تم تحديث العضوية" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر تحديث العضوية" };
  }
}

export async function closeSheetAction(input: unknown): Promise<OperationResult> {
  const parsed = z.object({ sheetId: uuid, expectedVersion: z.number().int().nonnegative() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "طلب إغلاق غير صالح" };
  try {
    await requireRole(["admin"]);
    const client = await createServerSupabase();
    await callRpc(client, "close_sheet", { p_sheet_id: parsed.data.sheetId, p_expected_version: parsed.data.expectedVersion });
    revalidatePath("/admin/archive");
    revalidatePath("/admin/sheets");
    return { ok: true, message: "تم إغلاق اليومية" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "تعذر إغلاق اليومية" };
  }
}
export async function saveBulkNightOrdersAndCreateMorningSheetAction(input: unknown): Promise<{
  ok: boolean;
  message: string;
  sheetId?: string;
  revisionId?: string;
}> {
  const parsed = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      orders: z.array(
        z.object({
          storeId: z.string().uuid(),
          lines: z.array(
            z.object({
              product_id: z.string().uuid(),
              quantity: z.string().regex(/^\d{1,9}(\.\d{1,3})?$/),
              note: z.string().max(300).nullable().optional(),
            }),
          ),
        }),
      ),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "بيانات الطلبات غير صالحة" };
  }

  try {
    await requireRole(["admin", "worker"]);
    const client = await createServerSupabase();
    const { date, orders } = parsed.data;

    // 1. حفظ جميع طلبات البقالات عبر RPC المعتمد
    for (const order of orders) {
      await callRpc(client, "upsert_night_order", {
        p_business_date: date,
        p_store_id: order.storeId,
        p_lines: order.lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          note: l.note ?? null,
        })),
        p_submit: true, // اعتماد وحفظ الطلب
      });
    }

    // 2. إنشاء / فتح كشف الصباح ليوم العمل المستهدف
    const draftRes = await callRpc<{
      sheet_id: string;
      revision_id: string;
      version: number;
      status: string;
    }>(client, "get_or_create_draft", { p_business_date: date });

    revalidatePath("/worker/night-orders");
    revalidatePath("/worker/sheets");
    revalidatePath("/worker");
    revalidatePath("/admin/night-orders");
    revalidatePath("/admin/sheets");

    return {
      ok: true,
      message: "تم حفظ جميع طلبات الليل وإنشاء كشف الصباح بنجاح في قاعدة البيانات",
      sheetId: draftRes.sheet_id,
      revisionId: draftRes.revision_id,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "تعذر حفظ الطلبات وإنشاء الكشف",
    };
  }
}

export async function setUserPermissionOverrideAction(input: unknown): Promise<OperationResult> {
  const parsed = z
    .object({
      userId: uuid,
      permissionCode: z.string().min(1).max(50),
      allowed: z.boolean(),
    })
    .safeParse(input);

  if (!parsed.success) return { ok: false, message: "بيانات الصلاحية غير صالحة" };

  try {
    const admin = await requireRole(["admin"]);
    const client = await createServerSupabase();

    const { error } = await client.from("user_permission_overrides").upsert(
      {
        user_id: parsed.data.userId,
        permission_code: parsed.data.permissionCode,
        allowed: parsed.data.allowed,
        granted_by: admin.userId,
      } as never,
      { onConflict: "user_id,permission_code" },
    );

    if (error) throw new Error("تعذر تحديث مفتاح الصلاحية في قاعدة البيانات");

    revalidatePath("/admin/users");
    revalidatePath("/worker/sheets");
    return { ok: true, message: "تم تحديث الصلاحية بنجاح" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "تعذر تحديث الصلاحية",
    };
  }
}
