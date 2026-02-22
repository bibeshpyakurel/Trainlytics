import { NextResponse } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { logServerError } from "@/lib/monitoring";

type MonitoringPayload = {
  event?: string;
  message?: string;
  context?: Record<string, unknown>;
  pathname?: string | null;
  timestamp?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MonitoringPayload;
    const event = (body.event ?? "").trim();
    const message = (body.message ?? "").trim();

    if (!event) {
      return jsonError("Event is required.", 400);
    }

    logServerError(`client.${event}`, message || "Client runtime error", {
      pathname: body.pathname ?? null,
      clientTimestamp: body.timestamp ?? null,
      userAgent: request.headers.get("user-agent"),
      context: body.context ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("client.monitoring_endpoint.failed", error);
    return jsonError("Failed to process monitoring payload.", 500);
  }
}
