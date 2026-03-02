import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES, getSafeProtectedNextRoute, isProtectedRoute, isPublicRoute } from "@/lib/routes";
import {
  SESSION_STARTED_AT_COOKIE,
  isSessionExpiredFromStart,
  parseSessionStartedAt,
} from "@/lib/sessionTimeout";

function isEntryDocumentRequest(request: NextRequest) {
  return request.method === "GET" && request.headers.get("sec-fetch-dest") === "document";
}

function buildNextFromRequest(request: NextRequest) {
  return `${request.nextUrl.pathname}${request.nextUrl.search}`;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPath = isProtectedRoute(pathname);
  const shouldRouteThroughLaunch = pathname === "/";

  if (pathname !== ROUTES.launch && pathname !== ROUTES.sessionExpired && shouldRouteThroughLaunch && isEntryDocumentRequest(request)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.launch;
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", buildNextFromRequest(request));
    return NextResponse.redirect(redirectUrl);
  }

  const routeNeedsAuthCheck = isProtectedPath || isPublicRoute(pathname);

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
      redirectUrl.pathname = ROUTES.sessionExpired;
      redirectUrl.search = "";
      const safeNext = getSafeProtectedNextRoute(buildNextFromRequest(request));
      if (safeNext) {
        redirectUrl.searchParams.set("next", safeNext);
      }

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

  if (!user && isProtectedPath) {
    const hasSupabaseCookie = request.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith("sb-"));

    if (hasSupabaseCookie) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = ROUTES.sessionExpired;
      redirectUrl.search = "";
      redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(redirectUrl);
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = ROUTES.login;
    redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    redirectUrl.searchParams.set("reason", "auth_required");
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
