import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES, isProtectedRoute, isPublicRoute } from "@/lib/routes";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const routeNeedsAuthCheck = isProtectedRoute(pathname) || isPublicRoute(pathname);

  if (!routeNeedsAuthCheck) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedRoute(pathname)) {
    const hasSupabaseCookie = request.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith("sb-"));

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.login;
    redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    redirectUrl.searchParams.set("reason", hasSupabaseCookie ? "session_expired" : "auth_required");
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isPublicRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.dashboard;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
