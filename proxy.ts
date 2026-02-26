import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES, isProtectedRoute, isPublicRoute } from "@/lib/routes";
import {
  SESSION_MAX_AGE_MS,
  SESSION_STARTED_AT_COOKIE,
  isSessionExpiredFromStart,
  parseSessionStartedAt,
} from "@/lib/sessionTimeout";

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

  if (user) {
    const now = Date.now();
    const startedAt = parseSessionStartedAt(request.cookies.get(SESSION_STARTED_AT_COOKIE)?.value);

    if (startedAt && isSessionExpiredFromStart(startedAt, now)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ROUTES.login;
      redirectUrl.search = "";
      redirectUrl.searchParams.set("reason", "session_expired");

      const expiredResponse = NextResponse.redirect(redirectUrl);
      request.cookies.getAll().forEach((cookie) => {
        if (cookie.name.startsWith("sb-") || cookie.name === SESSION_STARTED_AT_COOKIE) {
          expiredResponse.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
        }
      });

      return expiredResponse;
    }

    if (!startedAt) {
      response.cookies.set(SESSION_STARTED_AT_COOKIE, String(now), {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  }

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
