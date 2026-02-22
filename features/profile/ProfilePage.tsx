"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SaveStatusOverlay from "@/features/profile/components/SaveStatusOverlay";
import AvatarCropModal from "@/features/profile/components/AvatarCropModal";
import DeleteAvatarConfirmModal from "@/features/profile/components/DeleteAvatarConfirmModal";
import { STORAGE_KEYS, setStoredBoolean } from "@/lib/preferences";
import { clearAccountScopedClientState } from "@/lib/accountScopedClientState";
import { CLASS_GRADIENT_PRIMARY } from "@/lib/uiTokens";
import TogglePill from "@/shared/ui/TogglePill";
import { STORAGE_BUCKETS, STORAGE_PUBLIC_PATH_MARKERS, TABLES } from "@/lib/dbNames";
import { APP_COPY } from "@/lib/appCopy";
import { ROUTES, buildLoginRedirectPath } from "@/lib/routes";

type ThemeMode = "light" | "dark";
type SaveOverlayState = "hidden" | "saving" | "success";
type AvatarCropState = {
  sourceUrl: string;
};
const NAME_PATTERN = /^[A-Za-z][A-Za-z '-]*$/;
const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "At least 1 uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "At least 1 lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "At least 1 number", test: (value: string) => /[0-9]/.test(value) },
  { label: "At least 1 special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export default function ProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeleteAvatarConfirmOpen, setIsDeleteAvatarConfirmOpen] = useState(false);
  const [saveOverlayState, setSaveOverlayState] = useState<SaveOverlayState>("hidden");
  const [avatarCropState, setAvatarCropState] = useState<AvatarCropState | null>(null);
  const [cropZoom, setCropZoom] = useState(1.2);
  const [cropOffsetX, setCropOffsetX] = useState(0);
  const [cropOffsetY, setCropOffsetY] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [launchAnimationEnabled, setLaunchAnimationEnabled] = useState(true);
  const [speakRepliesEnabled, setSpeakRepliesEnabled] = useState(false);
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const isNameFormValid = useMemo(() => {
    if (!normalizedFirstName && !normalizedLastName) return false;
    if (normalizedFirstName && !NAME_PATTERN.test(normalizedFirstName)) return false;
    if (normalizedLastName && !NAME_PATTERN.test(normalizedLastName)) return false;
    return true;
  }, [normalizedFirstName, normalizedLastName]);
  const passwordRuleFailures = useMemo(
    () => PASSWORD_RULES.filter((rule) => !rule.test(newPassword)),
    [newPassword]
  );

  useEffect(() => {
    let isMounted = true;

    (async () => {
      const root = document.documentElement;
      const currentTheme = root.classList.contains("dark") ? "dark" : "light";
      const savedLaunch = localStorage.getItem(STORAGE_KEYS.launchAnimationEnabled);
      const savedSpeakReplies = localStorage.getItem(STORAGE_KEYS.insightsSpeakReplies);

      if (!isMounted) return;

      setTheme(currentTheme);
      setLaunchAnimationEnabled(savedLaunch !== "false");
      setSpeakRepliesEnabled(savedSpeakReplies === "true");

      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (error || !data.session) {
        router.replace(buildLoginRedirectPath(ROUTES.profile, "session_expired"));
        return;
      }

      const sessionUserId = data.session.user.id;
      setUserId(sessionUserId);
      setEmail(data.session.user.email ?? "");

      const { data: profileRow, error: profileError } = await supabase
        .from(TABLES.profiles)
        .select("first_name,last_name,avatar_url")
        .eq("user_id", sessionUserId)
        .maybeSingle();

      if (!isMounted) return;

      if (profileError) {
        setMsg("Profile table is not set up yet. Add db/profiles.sql in Supabase.");
      } else {
        setFirstName(profileRow?.first_name ?? "");
        setLastName(profileRow?.last_name ?? "");
        setAvatarUrl(profileRow?.avatar_url ?? null);
      }

      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  function applyTheme(nextTheme: ThemeMode) {
    const root = document.documentElement;
    root.classList.toggle("dark", nextTheme === "dark");
    root.style.colorScheme = nextTheme;
    localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
    setTheme(nextTheme);
  }

  function toggleLaunchAnimation() {
    setLaunchAnimationEnabled((current) => {
      const next = !current;
      setStoredBoolean(STORAGE_KEYS.launchAnimationEnabled, next);
      return next;
    });
  }

  function toggleSpeakReplies() {
    setSpeakRepliesEnabled((current) => {
      const next = !current;
      setStoredBoolean(STORAGE_KEYS.insightsSpeakReplies, next);
      return next;
    });
  }

  async function signOut() {
    setIsSigningOut(true);
    setMsg(null);
    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (error) {
      setMsg(`Failed to sign out: ${error.message}`);
      return;
    }

    clearAccountScopedClientState();
    router.replace(ROUTES.signout);
  }

  async function updatePassword() {
    if (!newPassword || !confirmNewPassword) {
      setMsg("Please enter and confirm a new password.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setMsg("Password and confirm password do not match.");
      return;
    }

    if (passwordRuleFailures.length > 0) {
      setMsg("Password does not meet requirements.");
      return;
    }

    setIsUpdatingPassword(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsUpdatingPassword(false);

    if (error) {
      setMsg(`Failed to update password: ${error.message}`);
      return;
    }

    setNewPassword("");
    setConfirmNewPassword("");
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setMsg("Password updated ✅");
  }

  async function saveName() {
    if (!userId) return;
    setIsSavingName(true);
    setSaveOverlayState("saving");
    setMsg(null);

    if (!normalizedFirstName && !normalizedLastName) {
      setIsSavingName(false);
      setSaveOverlayState("hidden");
      setMsg("Please enter at least a first name or last name before saving.");
      return;
    }

    if (normalizedFirstName && !NAME_PATTERN.test(normalizedFirstName)) {
      setIsSavingName(false);
      setSaveOverlayState("hidden");
      setMsg("First name must be letters only (spaces, apostrophes, and hyphens allowed).");
      return;
    }

    if (normalizedLastName && !NAME_PATTERN.test(normalizedLastName)) {
      setIsSavingName(false);
      setSaveOverlayState("hidden");
      setMsg("Last name must be letters only (spaces, apostrophes, and hyphens allowed).");
      return;
    }

    const { error } = await supabase.from(TABLES.profiles).upsert(
      {
        user_id: userId,
        first_name: normalizedFirstName || null,
        last_name: normalizedLastName || null,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      setIsSavingName(false);
      setSaveOverlayState("hidden");
      setMsg(`Failed to save name: ${error.message}`);
      return;
    }

    setFirstName(normalizedFirstName);
    setLastName(normalizedLastName);
    setIsSavingName(false);
    setSaveOverlayState("success");
    window.setTimeout(() => setSaveOverlayState("hidden"), 900);
    setMsg("Profile name saved ✅");
  }

  function openCropForFile(file: File) {
    if (!userId) return;

    const mimeType = file.type.toLowerCase();
    if (!mimeType.startsWith("image/")) {
      setMsg("Please choose an image file.");
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    setAvatarCropState({
      sourceUrl,
    });
    setCropZoom(1.2);
    setCropOffsetX(0);
    setCropOffsetY(0);
  }

  function closeCropModal() {
    setAvatarCropState((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev.sourceUrl);
      }
      return null;
    });
  }

  async function recropExistingAvatar() {
    if (!avatarUrl) return;
    setMsg(null);

    try {
      const response = await fetch(avatarUrl);
      if (!response.ok) {
        setMsg("Could not load current photo for editing.");
        return;
      }
      const blob = await response.blob();
      const sourceUrl = URL.createObjectURL(blob);
      setAvatarCropState({
        sourceUrl,
      });
      setCropZoom(1.2);
      setCropOffsetX(0);
      setCropOffsetY(0);
    } catch {
      setMsg("Could not load current photo for editing.");
    }
  }

  async function applyCropAndUpload() {
    if (!userId || !avatarCropState) return;

    setIsUploadingAvatar(true);
    setMsg(null);

    const image = new window.Image();
    image.src = avatarCropState.sourceUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image load failed"));
    });

    const size = 512;
    const previewSize = 288;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      setIsUploadingAvatar(false);
      setMsg("Failed to process image.");
      return;
    }

    const baseScale = Math.max(previewSize / image.width, previewSize / image.height);
    const finalScale = baseScale * cropZoom;
    const drawWidth = image.width * finalScale * (size / previewSize);
    const drawHeight = image.height * finalScale * (size / previewSize);
    const centerX = size / 2 + cropOffsetX * (size / previewSize);
    const centerY = size / 2 + cropOffsetY * (size / previewSize);
    const drawX = centerX - drawWidth / 2;
    const drawY = centerY - drawHeight / 2;

    context.fillStyle = "#111827";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((generatedBlob) => resolve(generatedBlob), "image/jpeg", 0.92);
    });

    if (!blob) {
      setIsUploadingAvatar(false);
      setMsg("Failed to generate cropped image.");
      return;
    }

    closeCropModal();
    const extension = "jpg";
    const path = `${userId}/avatar-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKETS.profileAvatars).upload(path, blob, {
      upsert: true,
      contentType: "image/jpeg",
    });

    if (uploadError) {
      setIsUploadingAvatar(false);
      setMsg(
        `Failed to upload profile photo: ${uploadError.message}. Create bucket '${STORAGE_BUCKETS.profileAvatars}' and add policies.`
      );
      return;
    }

    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKETS.profileAvatars).getPublicUrl(path);
    const nextAvatarUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase.from(TABLES.profiles).upsert(
      {
        user_id: userId,
        avatar_url: nextAvatarUrl,
      },
      { onConflict: "user_id" }
    );

    setIsUploadingAvatar(false);

    if (updateError) {
      setMsg(`Failed to save profile photo URL: ${updateError.message}`);
      return;
    }

    setAvatarUrl(`${nextAvatarUrl}?t=${Date.now()}`);
    setMsg("Profile photo updated ✅");
  }

  function getAvatarStoragePath(url: string): string | null {
    const marker = STORAGE_PUBLIC_PATH_MARKERS.profileAvatars;
    const markerIndex = url.indexOf(marker);
    if (markerIndex < 0) return null;
    const rawPath = url.slice(markerIndex + marker.length).split("?")[0];
    if (!rawPath) return null;
    return decodeURIComponent(rawPath);
  }

  async function deleteAvatar() {
    if (!userId || !avatarUrl) return;

    setIsUploadingAvatar(true);
    setMsg(null);
    const storedPath = getAvatarStoragePath(avatarUrl);

    if (storedPath) {
      const { error: removeError } = await supabase.storage.from(STORAGE_BUCKETS.profileAvatars).remove([storedPath]);
      if (removeError) {
        setIsUploadingAvatar(false);
        setIsDeleteAvatarConfirmOpen(false);
        setMsg(`Failed to delete profile photo file: ${removeError.message}`);
        return;
      }
    }

    const { error: updateError } = await supabase.from(TABLES.profiles).upsert(
      {
        user_id: userId,
        avatar_url: null,
      },
      { onConflict: "user_id" }
    );

    setIsUploadingAvatar(false);
    setIsDeleteAvatarConfirmOpen(false);

    if (updateError) {
      setMsg(`Failed to clear profile photo: ${updateError.message}`);
      return;
    }

    setAvatarUrl(null);
    setMsg("Profile photo removed ✅");
  }

  if (loading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="relative z-10 mx-auto w-full max-w-4xl px-6 py-10">
          <p className="text-sm text-zinc-300">Loading profile settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(245,158,11,0.18),transparent_34%),radial-gradient(circle_at_84%_12%,rgba(59,130,246,0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:46px_46px] opacity-20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-4xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">Profile</p>
        <h1 className="mt-3 text-4xl font-bold text-white">Account Settings</h1>
        <p className="mt-2 text-zinc-300">Manage your account preferences and experience.</p>

        <div className="mt-6 grid grid-cols-1 gap-4">
          <section className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Personal Info</h2>
            <p className="mt-1 text-sm text-zinc-400">Save your name for profile personalization.</p>
            <div className="mt-4 flex items-center gap-4 rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-3">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-zinc-600 bg-zinc-800">
                {avatarUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-800 text-zinc-300">
                    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M12 12.75a5.25 5.25 0 1 0-5.25-5.25A5.26 5.26 0 0 0 12 12.75Zm0 1.5c-4.73 0-8.25 2.44-8.25 4.5V21h16.5v-2.25c0-2.06-3.52-4.5-8.25-4.5Z"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">Profile photo</p>
                <label className="mt-2 inline-flex cursor-pointer rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800">
                  {isUploadingAvatar ? "Uploading..." : "Upload / Change"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploadingAvatar || isSavingName || isSigningOut}
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0];
                      if (nextFile) {
                        openCropForFile(nextFile);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void recropExistingAvatar()}
                  disabled={!avatarUrl || isUploadingAvatar || isSavingName || isSigningOut}
                  className="ml-2 mt-2 inline-flex rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  Edit/Crop current
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteAvatarConfirmOpen(true)}
                  disabled={!avatarUrl || isUploadingAvatar || isSavingName || isSigningOut}
                  className="ml-2 mt-2 inline-flex rounded-lg border border-red-400/60 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  Delete photo
                </button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-first-name" className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                  First name
                </label>
                <input
                  id="profile-first-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="First name"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                />
              </div>
              <div>
                <label htmlFor="profile-last-name" className="mb-1 block text-xs uppercase tracking-wide text-zinc-400">
                  Last name
                </label>
                <input
                  id="profile-last-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Last name"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void saveName()}
              disabled={isSavingName || isSigningOut || isUploadingAvatar || !isNameFormValid}
              className={`mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-50 ${CLASS_GRADIENT_PRIMARY}`}
            >
              {isSavingName ? "Saving..." : "Save Name"}
            </button>
            {!isNameFormValid && (
              <p className="mt-2 text-xs text-zinc-400">
                Enter at least one valid name (letters only, spaces/apostrophes/hyphens allowed).
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Appearance</h2>
            <p className="mt-1 text-sm text-zinc-400">Set your preferred theme for all tabs.</p>
            <div className="mt-4 inline-flex rounded-xl border border-zinc-700/70 bg-zinc-950/60 p-1">
              <button
                type="button"
                onClick={() => applyTheme("light")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  theme === "light"
                    ? `${CLASS_GRADIENT_PRIMARY} text-zinc-900`
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => applyTheme("dark")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  theme === "dark"
                    ? `${CLASS_GRADIENT_PRIMARY} text-zinc-900`
                    : "text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                Dark
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Experience</h2>
            <p className="mt-1 text-sm text-zinc-400">Control app behavior after login and in AI chat.</p>

            <div className="mt-4 space-y-3">
              <label className="flex items-center justify-between rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Launch animation after login</p>
                  <p className="text-xs text-zinc-400">
                    Show the “{APP_COPY.appName}” transition before Dashboard.
                  </p>
                </div>
                <TogglePill enabled={launchAnimationEnabled} onToggle={toggleLaunchAnimation} />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-100">Insights voice replies</p>
                  <p className="text-xs text-zinc-400">Speak AI answers by default in the Insights tab.</p>
                </div>
                <TogglePill enabled={speakRepliesEnabled} onToggle={toggleSpeakReplies} />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-700/80 bg-zinc-900/70 p-5 backdrop-blur-md">
            <h2 className="text-lg font-semibold text-white">Account</h2>
            <p className="mt-1 text-sm text-zinc-400">Manage your current session.</p>
            <div className="mt-4 rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Email</p>
              <p className="mt-1 text-sm font-medium text-zinc-100">{email || "Not available"}</p>
            </div>
            <div className="mt-4 rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Update Password</p>

              <label htmlFor="profile-new-password" className="mt-3 block text-sm font-medium text-zinc-200">
                New password
              </label>
              <input
                id="profile-new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                autoComplete="new-password"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={showNewPassword}
                  onChange={(event) => setShowNewPassword(event.target.checked)}
                />
                Show password
              </label>

              <label htmlFor="profile-confirm-new-password" className="mt-3 block text-sm font-medium text-zinc-200">
                Confirm new password
              </label>
              <input
                id="profile-confirm-new-password"
                type={showConfirmNewPassword ? "text" : "password"}
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-amber-300/70 transition focus:ring-2"
                autoComplete="new-password"
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={showConfirmNewPassword}
                  onChange={(event) => setShowConfirmNewPassword(event.target.checked)}
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
                disabled={
                  isUpdatingPassword ||
                  isSigningOut ||
                  isSavingName ||
                  isUploadingAvatar
                }
                className={`mt-3 rounded-xl px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:brightness-110 disabled:opacity-50 ${CLASS_GRADIENT_PRIMARY}`}
              >
                {isUpdatingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={isSigningOut || isSavingName || isUploadingAvatar || isUpdatingPassword}
              className="mt-4 rounded-xl border border-red-400/60 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </section>
        </div>

        {msg && (
          <p className={`mt-4 text-sm ${msg.includes("✅") ? "text-emerald-300" : "text-red-300"}`}>
            {msg}
          </p>
        )}
      </div>

      {saveOverlayState !== "hidden" && (
        <SaveStatusOverlay state={saveOverlayState} />
      )}

      {avatarCropState && (
        <AvatarCropModal
          sourceUrl={avatarCropState.sourceUrl}
          cropZoom={cropZoom}
          cropOffsetX={cropOffsetX}
          cropOffsetY={cropOffsetY}
          isSaving={isUploadingAvatar}
          onChangeZoom={setCropZoom}
          onChangeOffsetX={setCropOffsetX}
          onChangeOffsetY={setCropOffsetY}
          onCancel={closeCropModal}
          onSave={() => void applyCropAndUpload()}
        />
      )}

      {isDeleteAvatarConfirmOpen && (
        <DeleteAvatarConfirmModal
          isDeleting={isUploadingAvatar}
          onCancel={() => setIsDeleteAvatarConfirmOpen(false)}
          onConfirm={() => void deleteAvatar()}
        />
      )}
    </div>
  );
}
