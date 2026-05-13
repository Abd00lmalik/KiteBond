import { NextResponse } from "next/server";
import { HuntRegistryABI } from "@/lib/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ data: HuntRegistryABI });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load hunt registry ABI", code: "AGENT_ABI_HUNT_ERROR" },
      { status: 500 }
    );
  }
}
