"use client";
export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { STORAGE_KEYS } from "@/lib/preferences";
import { APP_COPY } from "@/lib/appCopy";
import { INPUT_BASE_CLASS } from "@/lib/uiClasses";
import { ROUTES, getDefaultSignedInRoute, getSafeProtectedNextRoute } from "@/lib/routes";
import {
  getRecentLoginEmails,
  rememberRecentLoginEmail,
  removeRecentLoginEmail,
} from "@/lib/recentLoginEmails";
import { toFriendlyLoginReason, toFriendlySignInErrorMessage } from "@/lib/authErrors";
import { reportClientError } from "@/lib/monitoringClient";

function isInvalidCredentialsError(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes("invalid login credentials") ||
    text.includes("invalid email or password") ||
    text.includes("invalid credentials")
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recentEmails, setRecentEmails] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  function readSearchParam(name: string) {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(name);
  }

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      setRecentEmails(getRecentLoginEmails());
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: number | null = null;

    (async () => {
      timeoutId = window.setTimeout(() => {
        if (!isMounted) return;
        setCheckingSession(false);
      }, 3000);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (sessionError) {
        void reportClientError("auth.login.session_check_failed", sessionError, { stage: "getSession" });
        setCheckingSession(false);
        setMsg("Could not verify your session. Please sign in.");
        return;
      }

      if (!sessionData.session) {
        const reasonParam = readSearchParam("reason");
        const reasonMessage = toFriendlyLoginReason(reasonParam);
        if (reasonMessage) {
          setMsg(reasonMessage);
        }
        setCheckingSession(false);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (error || !data.user) {
        void reportClientError("auth.login.user_fetch_failed", error ?? "missing_user", {
          stage: "getUser",
        });
        setCheckingSession(false);
        setMsg("Session expired. Please sign in again.");
        return;
      }

      if (data.user) {
        const launchAnimationEnabled =
          localStorage.getItem(STORAGE_KEYS.launchAnimationEnabled) !== "false";
        const nextParam = readSearchParam("next");
        const nextRoute = getSafeProtectedNextRoute(nextParam);
        router.replace(nextRoute ?? getDefaultSignedInRoute(launchAnimationEnabled));
        return;
      }
    })();

    return () => {
      isMounted = false;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [router]);

  async function signIn(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      if (isInvalidCredentialsError(error.message)) {
        try {
          const response = await fetch("/api/auth/account-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });

          if (response.ok) {
            const payload = (await response.json()) as { exists?: boolean };
            if (!payload.exists) {
              setMsg("No account exists with this email. Please create an account first.");
              return;
            }
          }
        } catch (accountStatusError) {
          void reportClientError("auth.login.account_status_check_failed", accountStatusError, {
            stage: "account_status_fetch",
          });
        }

        setMsg("Wrong email or password. Please try again.");
        return;
      }

      setMsg(toFriendlySignInErrorMessage(error));
      return;
    }

    // If login succeeds, you should get a session here
    const hasSession = !!data.session;
    setLoading(false);

    if (!hasSession) {
      setMsg("Sign-in succeeded but no session started. Verify your email and try again.");
      return;
    }

    rememberRecentLoginEmail(email);
    setRecentEmails(getRecentLoginEmails());

    const launchAnimationEnabled = localStorage.getItem(STORAGE_KEYS.launchAnimationEnabled) !== "false";
    const nextParam = readSearchParam("next");
    const nextRoute = getSafeProtectedNextRoute(nextParam);
    router.replace(nextRoute ?? getDefaultSignedInRoute(launchAnimationEnabled));
  }

  const isError = !!msg && !msg.toLowerCase().includes("session expired") && !msg.toLowerCase().includes("sign in to continue");

  function selectRecentEmail(value: string) {
    setEmail(value);
    setMsg(null);
  }

  function removeRecentEmail(value: string) {
    removeRecentLoginEmail(value);
    setRecentEmails(getRecentLoginEmails());
    if (email.trim().toLowerCase() === value.toLowerCase()) {
      setEmail("");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,158,11,0.24),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_60%_95%,rgba(59,130,246,0.14),transparent_38%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:44px_44px] opacity-20" />
        <div className="absolute -top-24 left-[-40px] h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute bottom-[-80px] right-[-20px] h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
        <div className="hidden w-full max-w-lg pr-10 md:block">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-300/80">
            Built For Progress
          </p>
          <h2 className="mt-4 text-5xl font-black leading-tight text-white">
            Train Hard.
            <br />
            Stay Consistent.
            <br />
            Lift Stronger.
          </h2>
          <p className="mt-5 max-w-md text-zinc-300">
            Every rep compounds. Show up, log your sets, and keep the streak alive.
          </p>

          <div className="mt-8 grid max-w-md grid-cols-3 gap-3 text-center text-xs text-zinc-200">
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">4x</p>
              <p className="mt-1 text-zinc-400">Sessions/Wk</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">+1%</p>
              <p className="mt-1 text-zinc-400">Every Day</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">PR</p>
              <p className="mt-1 text-zinc-400">Mindset</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md rounded-3xl border border-zinc-700/70 bg-zinc-900/70 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            {APP_COPY.loginBrand}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">{APP_COPY.loginHeading} 💪</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Sign in and keep your progress moving. One workout at a time.
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Need a new account?{" "}
            <Link href={ROUTES.signup} className="font-semibold text-amber-300 hover:text-amber-200">
              Create one here
            </Link>
            .
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Forgot password?{" "}
            <Link href={ROUTES.forgotPassword} className="font-semibold text-amber-300 hover:text-amber-200">
              Reset with OTP
            </Link>
            .
          </p>

          {recentEmails.length > 0 && (
            <div className="mt-5 rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Recent accounts on this device</p>
              <div className="mt-2 space-y-2">
                {recentEmails.map((recentEmail) => (
                  <div
                    key={recentEmail}
                    className="flex items-center justify-between rounded-lg border border-zinc-700/70 bg-zinc-900/70 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => selectRecentEmail(recentEmail)}
                      className="text-left text-sm font-medium text-zinc-100 transition hover:text-amber-300"
                    >
                      {recentEmail}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRecentEmail(recentEmail)}
                      className="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={signIn} className="mt-5">
            <label htmlFor="email" className="block text-sm font-medium text-zinc-200">
              Email
            </label>
            <input
              id="email"
              className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <label htmlFor="password" className="mt-4 block text-sm font-medium text-zinc-200">
              Password
            </label>
            <input
              id="password"
              className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show password
            </label>

            <button
              type="submit"
              disabled={loading || checkingSession}
              className="mt-5 w-full rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
            >
              {checkingSession ? "Checking session..." : loading ? "Working..." : "Sign in"}
            </button>

            <p className="mt-4 text-center text-xs text-zinc-500">
              Discipline over motivation. Keep the streak alive.
            </p>
          </form>

          {msg && (
            <p className={`mt-4 text-sm ${isError ? "text-red-300" : "text-emerald-300"}`}>
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
