"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { APP_COPY } from "@/lib/appCopy";
import { TABLES } from "@/lib/dbNames";
import { ensureDefaultExercisesForUser } from "@/lib/defaultExercises";
import { INPUT_BASE_CLASS } from "@/lib/uiClasses";
import { ROUTES, getDefaultSignedInRoute, getSafeProtectedNextRoute } from "@/lib/routes";
import { STORAGE_KEYS } from "@/lib/preferences";
import { reportClientError } from "@/lib/monitoringClient";
import { runAuthSessionPreflight } from "@/lib/authPreflight";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "At least 1 uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "At least 1 lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "At least 1 number", test: (value: string) => /[0-9]/.test(value) },
  { label: "At least 1 special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

function getPasswordValidationErrors(password: string) {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
}

export default function SignUpPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"error" | "success">("success");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [otpCode, setOtpCode] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationFirstName, setVerificationFirstName] = useState<string | null>(null);
  const [verificationLastName, setVerificationLastName] = useState<string | null>(null);

  const passwordErrors = useMemo(() => getPasswordValidationErrors(password), [password]);

  function showError(message: string) {
    setMsg(message);
    setMsgTone("error");
  }

  function showSuccess(message: string) {
    setMsg(message);
    setMsgTone("success");
  }

  function readNextParam() {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("next");
  }

  useEffect(() => {
    return runAuthSessionPreflight({
      setCheckingSession,
      timeoutMs: 3000,
      onSessionError: (sessionError) => {
        void reportClientError("auth.signup.session_check_failed", sessionError, { stage: "getSession" });
        showError("Could not verify your session. Please try again.");
      },
      onAuthenticated: () => {
        const launchAnimationEnabled =
          localStorage.getItem(STORAGE_KEYS.launchAnimationEnabled) !== "false";
        const nextParam = readNextParam();
        const nextRoute = getSafeProtectedNextRoute(nextParam);
        router.replace(nextRoute ?? getDefaultSignedInRoute(launchAnimationEnabled));
      },
    });
  }, [router]);

  async function signUp(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setMsg(null);

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedConfirmEmail = confirmEmail.trim().toLowerCase();

    if (!normalizedFirstName || !normalizedLastName) {
      showError("Please enter your first and last name.");
      return;
    }

    if (!normalizedEmail || !normalizedConfirmEmail) {
      showError("Please enter and confirm your email.");
      return;
    }

    if (normalizedEmail !== normalizedConfirmEmail) {
      showError("Email and confirm email do not match.");
      return;
    }

    if (!password || !confirmPassword) {
      showError("Please enter and confirm your password.");
      return;
    }

    if (password !== confirmPassword) {
      showError("Password and confirm password do not match.");
      return;
    }

    if (passwordErrors.length > 0) {
      showError("Password does not meet requirements.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
        },
      },
    });

    if (error) {
      setLoading(false);
      showError(`Sign-up failed: ${error.message}`);
      return;
    }

    const userId = data.user?.id;
    const hasSession = !!data.session;

    if (userId && hasSession) {
      const { error: profileError } = await supabase.from(TABLES.profiles).upsert(
        {
          user_id: userId,
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
        },
        { onConflict: "user_id" }
      );

      if (profileError) {
        setLoading(false);
        showError("Account created, but profile details could not be saved yet. You can update them later.");
        return;
      }

      const seedError = await ensureDefaultExercisesForUser(userId);
      if (seedError) {
        setLoading(false);
        showError(`Account created, but default exercises could not be prepared: ${seedError}`);
        return;
      }
    }

    setLoading(false);

    if (hasSession) {
      const launchAnimationEnabled = localStorage.getItem(STORAGE_KEYS.launchAnimationEnabled) !== "false";
      const nextParam = readNextParam();
      const nextRoute = getSafeProtectedNextRoute(nextParam);
      router.replace(nextRoute ?? getDefaultSignedInRoute(launchAnimationEnabled));
      return;
    }

    setVerificationEmail(normalizedEmail);
    setVerificationFirstName(normalizedFirstName);
    setVerificationLastName(normalizedLastName);
    setOtpCode("");
    showSuccess("Account created. Enter the OTP sent to your email to verify your account.");
  }

  async function verifyOtpCode() {
    if (!verificationEmail) {
      showError("Missing verification email. Please create account again.");
      return;
    }

    const token = otpCode.trim();
    if (!token) {
      showError("Enter the OTP code sent to your email.");
      return;
    }

    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.auth.verifyOtp({
      email: verificationEmail,
      token,
      type: "signup",
    });

    if (error) {
      setLoading(false);
      showError(`OTP verification failed: ${error.message}`);
      return;
    }

    const sessionUserId = data.user?.id;
    if (
      sessionUserId &&
      data.session &&
      verificationFirstName &&
      verificationLastName
    ) {
      const { error: profileError } = await supabase.from(TABLES.profiles).upsert(
        {
          user_id: sessionUserId,
          first_name: verificationFirstName,
          last_name: verificationLastName,
        },
        { onConflict: "user_id" }
      );

      if (profileError) {
        void reportClientError("auth.signup.otp_profile_upsert_failed", profileError, {
          stage: "otp_verify_profile_upsert",
        });
        setLoading(false);
        showError("Email verified, but profile details could not be saved yet. Please update them in Profile.");
        return;
      }

      const seedError = await ensureDefaultExercisesForUser(sessionUserId);
      if (seedError) {
        setLoading(false);
        showError(`Email verified, but default exercises could not be prepared: ${seedError}`);
        return;
      }
    }

    setLoading(false);

    if (data.session) {
      const launchAnimationEnabled = localStorage.getItem(STORAGE_KEYS.launchAnimationEnabled) !== "false";
      const nextParam = readNextParam();
      const nextRoute = getSafeProtectedNextRoute(nextParam);
      router.replace(nextRoute ?? getDefaultSignedInRoute(launchAnimationEnabled));
      return;
    }

    showSuccess("Email verified. You can now sign in.");
    router.replace(ROUTES.login);
  }

  async function resendOtpCode() {
    if (!verificationEmail) {
      showError("Missing verification email. Please create account again.");
      return;
    }

    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: verificationEmail,
    });

    setLoading(false);

    if (error) {
      showError(`Could not resend OTP: ${error.message}`);
      return;
    }

    showSuccess("A new OTP has been sent to your email.");
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
            Built For Momentum
          </p>
          <h2 className="mt-4 text-5xl font-black leading-tight text-white">
            Start Strong.
            <br />
            Stay Steady.
            <br />
            Build Better.
          </h2>
          <p className="mt-5 max-w-md text-zinc-300">
            Set your account up, lock in your plan, and turn effort into progress one session at a time.
          </p>

          <div className="mt-8 grid max-w-md grid-cols-3 gap-3 text-center text-xs text-zinc-200">
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">Plan</p>
              <p className="mt-1 text-zinc-400">Track Daily</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">Focus</p>
              <p className="mt-1 text-zinc-400">One Set More</p>
            </div>
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-3">
              <p className="text-lg font-semibold text-white">Win</p>
              <p className="mt-1 text-zinc-400">Consistency</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md rounded-3xl border border-zinc-700/70 bg-zinc-900/70 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            {APP_COPY.loginBrand}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">Create your account</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Set up your profile and start tracking workouts.
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Already have an account?{" "}
            <Link href={ROUTES.login} className="font-semibold text-amber-300 hover:text-amber-200">
              Go to login
            </Link>
            .
          </p>

          <form onSubmit={signUp} className="mt-5">
            <label htmlFor="first-name" className="block text-sm font-medium text-zinc-200">
              First name
            </label>
            <input
              id="first-name"
              className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />

            <label htmlFor="last-name" className="mt-4 block text-sm font-medium text-zinc-200">
              Last name
            </label>
            <input
              id="last-name"
              className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />

            <label htmlFor="email" className="mt-4 block text-sm font-medium text-zinc-200">
              Email
            </label>
            <input
              id="email"
              className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <label htmlFor="confirm-email" className="mt-4 block text-sm font-medium text-zinc-200">
              Confirm email
            </label>
            <input
              id="confirm-email"
              className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
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
              autoComplete="new-password"
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show password
            </label>

            <label htmlFor="confirm-password" className="mt-4 block text-sm font-medium text-zinc-200">
              Confirm password
            </label>
            <input
              id="confirm-password"
              className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={showConfirmPassword}
                onChange={(e) => setShowConfirmPassword(e.target.checked)}
              />
              Show confirm password
            </label>

            <ul className="mt-3 space-y-1 text-xs text-zinc-400">
              {PASSWORD_RULES.map((rule) => {
                const passed = rule.test(password);
                return (
                  <li key={rule.label} className={passed ? "text-emerald-300" : "text-zinc-400"}>
                    {passed ? "[x]" : "[ ]"} {rule.label}
                  </li>
                );
              })}
            </ul>

            <button
              type="submit"
              disabled={loading || checkingSession}
              className="mt-5 w-full rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
            >
              {checkingSession ? "Checking session..." : loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          {msg && (
            <p className={`mt-4 text-sm ${msgTone === "error" ? "text-red-300" : "text-emerald-300"}`}>
              {msg}
            </p>
          )}
        </div>
      </div>

      {verificationEmail && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/75 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-5 shadow-2xl">
            <p className="text-sm font-semibold text-zinc-100">Verify your email with OTP</p>
            <p className="mt-1 text-xs text-zinc-400">
              Enter the code sent to <span className="font-semibold text-zinc-200">{verificationEmail}</span>.
            </p>
            <label htmlFor="otp-code-overlay" className="mt-4 block text-sm font-medium text-zinc-200">
              OTP code
            </label>
            <input
              id="otp-code-overlay"
              className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void verifyOtpCode()}
                disabled={loading || checkingSession}
                className="flex-1 rounded-md bg-emerald-400 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
              <button
                type="button"
                onClick={() => void resendOtpCode()}
                disabled={loading || checkingSession}
                className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
              >
                Resend OTP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
