import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { scanId, reportHash, txHash } = (await req.json()) as {
    scanId?: string;
    reportHash?: string;
    txHash?: string;
  };

  if (!scanId || !txHash) {
    return NextResponse.json({ error: "scanId and txHash required", code: "ANCHOR_INPUT_REQUIRED" }, { status: 400 });
  }

  await prisma.instantScan.updateMany({
    where: { id: scanId },
    data: { proofTx: txHash, reportHash }
  });

  return NextResponse.json({ data: { success: true } });
}
