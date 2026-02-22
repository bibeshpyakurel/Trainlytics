type MonitoringContext = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /(password|token|secret|authorization|cookie|session|key)/i;

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeValue(nestedValue);
    }
    return out;
  }

  return value;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown client error";
}

export async function reportClientError(event: string, error: unknown, context?: MonitoringContext) {
  try {
    const payload = {
      event,
      message: toErrorMessage(error),
      context: sanitizeValue(context ?? {}),
      pathname: typeof window !== "undefined" ? window.location.pathname : null,
      timestamp: new Date().toISOString(),
    };

    await fetch("/api/monitoring/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Monitoring should never block UX.
  }
}
