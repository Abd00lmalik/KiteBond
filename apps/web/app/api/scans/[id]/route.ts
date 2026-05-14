import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const scan = await prisma.instantScan.findFirst({
      where: { OR: [{ id: params.id }, { scanId: params.id }] }
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found", code: "SCAN_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ data: scan });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to fetch scan";
    return apiError("Database operation failed. Please try again.", 500, detail);
  }
}
