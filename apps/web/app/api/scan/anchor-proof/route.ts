import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
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
      data: { proofTx: txHash, proofTxHash: txHash, reportHash, proofHash: reportHash, proofAnchored: true }
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error("[/api/scan/anchor-proof] Unhandled error:", err instanceof Error ? err.message : err);
    const detail = err instanceof Error ? err.message : "Could not record scan receipt";
    return apiError("Could not record scan receipt. Please try again.", 500, detail);
  }
}
