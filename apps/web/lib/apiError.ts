import { NextResponse } from "next/server";

export function apiError(message: string, status = 500, detail?: string): NextResponse {
  console.error(`[API Error ${status}] ${message}`, detail ?? "");
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(process.env.NODE_ENV === "development" && detail ? { detail } : {})
    },
    { status }
  );
}
