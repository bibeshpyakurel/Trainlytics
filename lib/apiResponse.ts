import { NextResponse } from "next/server";

type ErrorPayload = { error: string };

export function jsonError(message: string, status: number) {
  return NextResponse.json<ErrorPayload>({ error: message }, { status });
}
