"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/monitoringClient";

export default function GlobalErrorReporter() {
  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      void reportClientError("client.window.error", event.error ?? event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void reportClientError("client.unhandled.rejection", event.reason);
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
