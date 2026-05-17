import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const numericId = Number(params.id);
    const hunt = await prisma.hunt.findFirst({
      where: Number.isFinite(numericId)
        ? { OR: [{ id: params.id }, { chainHuntId: numericId }, { onChainId: numericId }] }
        : { id: params.id },
      include: {
        submissions: {
          select: {
            id: true,
            agentAddress: true,
            status: true,
            submittedAt: true,
            // Full fields — only sent if caller is creator
            reportJson: true,
            verifierResult: true,
            verifierReport: true,
            settlementTx: true,
            stakeTx: true,
            txHash: true,
            reportHash: true
          },
          orderBy: { submittedAt: "desc" }
        },
        _count: { select: { submissions: true } }
      }
    });

    if (!hunt) {
      return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    }

    const callerAddress = request.headers.get("x-wallet-address")?.toLowerCase().trim();
    const isCreator = Boolean(callerAddress && hunt.creatorAddress?.toLowerCase() === callerAddress);

    if (!isCreator) {
      // Public view — strip submission content, keep count and safe per-submission metadata
      const { submissions, ...huntWithoutSubs } = hunt;
      return NextResponse.json({
        data: {
          ...huntWithoutSubs,
          submissionsCount: hunt._count?.submissions ?? submissions.length,
          // Expose only safe fields — no reportJson, no verifierReport
          submissions: submissions.map(({ id, agentAddress, status, submittedAt }) => ({
            id,
            agentAddress,
            status,
            submittedAt
          }))
        }
      });
    }

    // Creator view — full data
    return NextResponse.json({ data: hunt });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to fetch hunt";
    return apiError("Database operation failed. Please try again.", 500, detail);
  }
}
