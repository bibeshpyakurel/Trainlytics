type MonitoringContext = Record<string, unknown>;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function getErrorStack(error: unknown) {
  if (error instanceof Error) return error.stack ?? null;
  return null;
}

export function logServerError(event: string, error: unknown, context?: MonitoringContext) {
  const payload = {
    source: "server",
    event,
    message: getErrorMessage(error),
    stack: getErrorStack(error),
    context: context ?? {},
    timestamp: new Date().toISOString(),
  };

  console.error("[monitoring]", JSON.stringify(payload));
}
