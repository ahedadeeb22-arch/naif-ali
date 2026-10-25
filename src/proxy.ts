import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Next.js 16 يستبدل `middleware` بـ`proxy`. منطق الجلسة نفسه في lib. */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$).*)",
  ],
};
