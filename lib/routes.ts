export const ROUTES = {
  login: "/login",
  signup: "/signup",
  forgotPassword: "/forgot-password",
  launch: "/launch",
  signout: "/signout",
  dashboard: "/dashboard",
  insights: "/insights",
  log: "/log",
  bodyweight: "/bodyweight",
  calories: "/calories",
  profile: "/profile",
} as const;

export const PUBLIC_ROUTES = [ROUTES.login, ROUTES.signup, ROUTES.forgotPassword] as const;

export const PROTECTED_ROUTES = [
  ROUTES.launch,
  ROUTES.dashboard,
  ROUTES.insights,
  ROUTES.log,
  ROUTES.bodyweight,
  ROUTES.calories,
  ROUTES.profile,
] as const;

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function getSafeProtectedNextRoute(rawNext: string | null | undefined): string | null {
  if (!rawNext) return null;
  if (!rawNext.startsWith("/") || rawNext.startsWith("//")) return null;

  try {
    const parsed = new URL(rawNext, "http://localhost");
    if (!isProtectedRoute(parsed.pathname)) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function getDefaultSignedInRoute(launchAnimationEnabled: boolean) {
  return launchAnimationEnabled ? ROUTES.launch : ROUTES.dashboard;
}

export function buildLoginRedirectPath(
  nextPath: string,
  reason: "auth_required" | "session_expired" = "auth_required"
) {
  const params = new URLSearchParams();
  params.set("next", nextPath);
  params.set("reason", reason);
  return `${ROUTES.login}?${params.toString()}`;
}

export const API_ROUTES = {
  insightsAi: "/api/insights-ai",
} as const;
