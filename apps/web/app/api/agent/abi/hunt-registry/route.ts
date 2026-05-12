import { NextResponse } from "next/server";
import { HuntRegistryABI } from "@/lib/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: HuntRegistryABI });
}
