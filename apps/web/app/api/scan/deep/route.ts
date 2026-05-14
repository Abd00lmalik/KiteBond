import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Deep Scan is not yet available. Use Instant Scan for full analysis."
    },
    { status: 501 }
  );
}
