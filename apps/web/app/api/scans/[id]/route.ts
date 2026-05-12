import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const scan = await prisma.instantScan.findFirst({
    where: { OR: [{ id: params.id }, { scanId: params.id }] }
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found", code: "SCAN_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ data: scan });
}
