"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { APP_COPY } from "@/lib/appCopy";
import { INPUT_BASE_CLASS } from "@/lib/uiClasses";
import { ROUTES, getDefaultSignedInRoute } from "@/lib/routes";
import { STORAGE_KEYS } from "@/lib/preferences";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "At least 1 uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "At least 1 lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "At least 1 number", test: (value: string) => /[0-9]/.test(value) },
  { label: "At least 1 special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"error" | "success">("success");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  function showError(message: string) {
    setMsg(message);
    setMsgTone("error");
  }

  function showSuccess(message: string) {
    setMsg(message);
    setMsgTone("success");
  }

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (!sessionData.session) {
        setCheckingSession(false);
        return;
      }

      const launchAnimationEnabled = localStorage.getItem(STORAGE_KEYS.launchAnimationEnabled) !== "false";
      router.replace(getDefaultSignedInRoute(launchAnimationEnabled));
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  async function checkEmailExists(targetEmail: string) {
    const response = await fetch("/api/auth/account-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not verify account status.");
    }

    const payload = (await response.json()) as { exists?: boolean };
    return !!payload.exists;
  }

  async function sendOtp() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      showError("Please enter your email.");
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const exists = await checkEmailExists(normalizedEmail);
      if (!exists) {
        setLoading(false);
        showError("No account exists with this email.");
        return;
      }
    } catch (error) {
      setLoading(false);
      showError(error instanceof Error ? error.message : "Could not verify account status. Please try again.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
      },
    });

    setLoading(false);

    if (error) {
      showError(`Could not send OTP: ${error.message}`);
      return;
    }

    setVerificationEmail(normalizedEmail);
    setOtpVerified(false);
    setOtpCode("");
    showSuccess("OTP sent. Enter the code from your email.");
  }

  async function verifyOtp() {
    if (!verificationEmail) {
      showError("Please request an OTP first.");
      return;
    }

    const token = otpCode.trim();
    if (!token) {
      showError("Enter the OTP code.");
      return;
    }

    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.auth.verifyOtp({
      email: verificationEmail,
      token,
      type: "recovery",
    });

    setLoading(false);

    if (error) {
      showError(`OTP verification failed: ${error.message}`);
      return;
    }

    if (!data.session) {
      showError("Verification completed but session was not created. Please sign in.");
      return;
    }

    setOtpVerified(true);
    showSuccess("OTP verified. Set your new password to continue.");
  }

  async function updatePassword() {
    if (!otpVerified) {
      showError("Please verify OTP first.");
      return;
    }

    if (!newPassword || !confirmNewPassword) {
      showError("Please enter and confirm your new password.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showError("Password and confirm password do not match.");
      return;
    }

    const failedRule = PASSWORD_RULES.find((rule) => !rule.test(newPassword));
    if (failedRule) {
      showError("Password does not meet requirements.");
      return;
    }

    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      showError(`Failed to update password: ${error.message}`);
      return;
    }

    showSuccess("Password updated successfully.");
    const launchAnimationEnabled = localStorage.getItem(STORAGE_KEYS.launchAnimationEnabled) !== "false";
    router.replace(getDefaultSignedInRoute(launchAnimationEnabled));
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(245,158,11,0.24),transparent_34%),radial-gradient(circle_at_88%_10%,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_60%_95%,rgba(59,130,246,0.14),transparent_38%)]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-zinc-700/70 bg-zinc-900/70 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            {APP_COPY.loginBrand}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">Forgot password</h1>
          <p className="mt-2 text-sm text-zinc-300">
            Enter your email, verify OTP, then set a new password.
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Back to{" "}
            <Link href={ROUTES.login} className="font-semibold text-amber-300 hover:text-amber-200">
              login
            </Link>
            .
          </p>

          <label htmlFor="email" className="mt-5 block text-sm font-medium text-zinc-200">
            Email
          </label>
          <input
            id="email"
            className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <button
            type="button"
            onClick={() => void sendOtp()}
            disabled={loading || checkingSession}
            className="mt-4 w-full rounded-md bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
          >
            {checkingSession ? "Checking session..." : loading ? "Sending..." : "Send OTP"}
          </button>

          {verificationEmail && !otpVerified && (
            <div className="mt-6 rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-4">
              <p className="text-sm font-semibold text-zinc-100">Enter OTP</p>
              <p className="mt-1 text-xs text-zinc-400">
                Code sent to <span className="font-semibold text-zinc-200">{verificationEmail}</span>.
              </p>
              <input
                className={`mt-3 w-full ${INPUT_BASE_CLASS}`}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
              />

              <button
                type="button"
                onClick={() => void verifyOtp()}
                disabled={loading || checkingSession}
                className="mt-3 w-full rounded-md bg-emerald-400 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
            </div>
          )}

          {otpVerified && (
            <div className="mt-6 rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-4">
              <p className="text-sm font-semibold text-zinc-100">Set new password</p>
              <p className="mt-1 text-xs text-zinc-400">
                OTP verified for <span className="font-semibold text-zinc-200">{verificationEmail}</span>.
              </p>

              <label htmlFor="forgot-new-password" className="mt-3 block text-sm font-medium text-zinc-200">
                New password
              </label>
              <input
                id="forgot-new-password"
                className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={showNewPassword}
                  onChange={(e) => setShowNewPassword(e.target.checked)}
                />
                Show password
              </label>

              <label htmlFor="forgot-confirm-password" className="mt-3 block text-sm font-medium text-zinc-200">
                Confirm new password
              </label>
              <input
                id="forgot-confirm-password"
                className={`mt-1 w-full ${INPUT_BASE_CLASS}`}
                type={showConfirmNewPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={showConfirmNewPassword}
                  onChange={(e) => setShowConfirmNewPassword(e.target.checked)}
                />
                Show confirm password
              </label>

              <ul className="mt-3 space-y-1 text-xs text-zinc-400">
                {PASSWORD_RULES.map((rule) => {
                  const passed = rule.test(newPassword);
                  return (
                    <li key={rule.label} className={passed ? "text-emerald-300" : "text-zinc-400"}>
                      {passed ? "[x]" : "[ ]"} {rule.label}
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={() => void updatePassword()}
                disabled={loading || checkingSession}
                className="mt-3 w-full rounded-md bg-emerald-400 py-2 font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? "Updating..." : "Update password and continue"}
              </button>
            </div>
          )}

          {msg && (
            <p className={`mt-4 text-sm ${msgTone === "error" ? "text-red-300" : "text-emerald-300"}`}>
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
