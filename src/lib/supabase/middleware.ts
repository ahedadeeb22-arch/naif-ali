import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth", "/offline"];

/**
 * تحديث الجلسة في كل طلب وتوجيه غير المصادقين إلى /login.
 * هذا حاجز UX فقط؛ التحقق الحقيقي في كل Server Action/Route ثم RLS.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // بيئة غير مهيأة: نسمح بفتح صفحة الإعداد فقط بدل تعطل الموقع بالكامل.
    if (request.nextUrl.pathname.startsWith("/setup")) return response;
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items: { name: string; value: string; options?: CookieOptions }[]) {
        for (const item of items) request.cookies.set(item.name, item.value);
        response = NextResponse.next({ request });
        for (const item of items) response.cookies.set(item.name, item.value, item.options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) || pathname === "/setup";

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
