type SignInErrorShape = {
  message?: string;
  status?: number;
};

function asLower(value: string | undefined) {
  return (value ?? "").toLowerCase();
}

export function toFriendlySignInErrorMessage(error: SignInErrorShape) {
  const message = asLower(error.message);
  const status = error.status;

  const isNetworkFailure =
    status === 0 ||
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("network error");

  if (isNetworkFailure) {
    return "Network issue while signing in. Check your connection and try again.";
  }

  if (status === 429 || message.includes("too many requests")) {
    return "Too many sign-in attempts. Wait a moment, then try again.";
  }

  const isEmailNotConfirmed =
    message.includes("email not confirmed") ||
    message.includes("email confirmation") ||
    message.includes("confirm your email");

  if (isEmailNotConfirmed) {
    return "Your email is not verified yet. Check your inbox, then sign in again.";
  }

  const isInvalidCredentials =
    message.includes("invalid login credentials") ||
    message.includes("invalid email or password") ||
    message.includes("invalid credentials");

  if (isInvalidCredentials) {
    return "Wrong email or password. Please try again.";
  }

  return "Could not sign in right now. Please try again.";
}

export function toFriendlyLoginReason(reason: string | null) {
  if (reason === "session_expired") {
    return "Your session expired. Please sign in again.";
  }

  if (reason === "auth_required") {
    return "Please sign in to continue.";
  }

  return null;
}
