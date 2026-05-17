import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AUTH NOTE: Access control uses Option A — wallet address header (x-wallet-address).
// This is NOT cryptographically verified (no signed message). It is appropriate for a
// testnet hackathon app. For production, replace with SIWE or a signed message scheme.

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const numericId = Number(params.id);
    const hunt = await prisma.hunt.findFirst({
      where: Number.isFinite(numericId)
        ? { OR: [{ id: params.id }, { chainHuntId: numericId }, { onChainId: numericId }] }
        : { id: params.id },
      include: {
        submissions: {
          orderBy: { submittedAt: "desc" }
        },
        _count: { select: { submissions: true } }
      }
    });

    if (!hunt) {
      return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    }

    // Determine if caller is the hunt creator
    const callerAddress = request.headers.get("x-wallet-address")?.toLowerCase().trim();
    const isCreator = Boolean(callerAddress && hunt.creatorAddress?.toLowerCase() === callerAddress);

    if (!isCreator) {
      // Public response: count only, no submission content
      return NextResponse.json({
        submissionsCount: hunt._count?.submissions ?? hunt.submissions.length,
        hunt: {
          id: hunt.id,
          packageName: hunt.packageName,
          version: hunt.version,
          status: hunt.status,
          rewardAmount: hunt.rewardAmount,
          stakeRequired: hunt.stakeRequired,
          deadline: hunt.deadline.toISOString()
        }
      });
    }

    // Creator response: full submission data
    return NextResponse.json({
      submissionsCount: hunt.submissions.length,
      submissions: hunt.submissions.map((submission) => ({
        id: submission.id,
        agentAddress: submission.agentAddress,
        status: submission.status,
        reportJson: submission.reportJson,
        submittedAt: submission.submittedAt.toISOString(),
        verifierResult: submission.verifierResult,
        verifierReport: submission.verifierReport,
        settlementTx: submission.settlementTx
      }))
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to list submissions";
    return apiError("Database operation failed. Please try again.", 500, detail);
  }
}
