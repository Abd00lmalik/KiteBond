import { NextResponse } from "next/server";
import { ScanPaymentsABI } from "@/lib/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: ScanPaymentsABI });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load scan payments ABI", code: "AGENT_ABI_SCAN_ERROR" },
      { status: 500 }
    );
  }
}
