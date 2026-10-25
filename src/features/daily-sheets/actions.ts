"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { callRpc } from "@/lib/rpc";
import type { MutationResult, OpenDraftResult } from "@/features/daily-sheets/action-types";

/** يفتح/ينشئ مسودة اليومية ويعيد Revision والنسخة التي تُرسل لاحقًا. */
export async function openDraftAction(input: unknown): Promise<MutationResult<OpenDraftResult>> {
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح") }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "تاريخ يوم العمل غير صالح" };

  try {
    await requireRole(["admin", "worker"]);
    const supabase = await createServerSupabase();
    const result = await callRpc<{
      sheet_id: string;
      revision_id: string;
      version: number;
      status: string;
    }>(supabase, "get_or_create_draft", { p_business_date: parsed.data.date });
    return {
      ok: true,
      data: {
        sheetId: result.sheet_id,
        revisionId: result.revision_id,
        version: result.version,
        status: result.status,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "تعذر فتح المسودة" };
  }
}
