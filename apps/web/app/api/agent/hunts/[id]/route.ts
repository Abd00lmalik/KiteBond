import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AUTH NOTE: This is testnet-grade auth using x-wallet-address.
// Production should use signed wallet auth such as SIWE.

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const hunt = await prisma.hunt.findUnique({
      where: { id: params.id },
      include: {
        submissions: true,
        _count: { select: { submissions: true } }
      }
    });

    if (!hunt) {
      return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    }

    const callerAddress = request.headers.get("x-wallet-address")?.toLowerCase().trim();
    const isCreator = Boolean(callerAddress && hunt.creatorAddress?.toLowerCase() === callerAddress);

    // Public response — no private submission data
    const publicHunt = {
      id: hunt.id,
      chainHuntId: hunt.chainHuntId,
      onChainId: hunt.onChainId,
      creatorAddress: hunt.creatorAddress,
      packageName: hunt.packageName,
      version: hunt.version,
      scanDepth: hunt.scanDepth,
      rewardAmount: parseUnits(hunt.rewardAmount, 18).toString(),
      stakeRequired: parseUnits(hunt.stakeRequired, 18).toString(),
      stakeAmount: hunt.stakeAmount ? parseUnits(hunt.stakeAmount, 18).toString() : null,
      deadline: hunt.deadline.toISOString(),
      status: hunt.status,
      termsHash: hunt.termsHash,
      createdTx: hunt.createdTx,
      txHash: hunt.txHash,
      winnerAddress: hunt.winnerAddress,
      settlementTx: hunt.settlementTx,
      createdAt: hunt.createdAt.toISOString(),
      submissionsCount: hunt._count?.submissions ?? hunt.submissions.length
    };

    if (!isCreator) {
      // Public: only submission count and safe per-submission metadata
      return NextResponse.json({
        data: {
          ...publicHunt,
          submissions: hunt.submissions.map((s) => ({
            id: s.id,
            agentAddress: s.agentAddress,
            status: s.status,
            submittedAt: s.submittedAt.toISOString()
          }))
        }
      });
    }

    // Creator: full submission data including reports
    return NextResponse.json({
      data: {
        ...publicHunt,
        submissions: hunt.submissions.map((s) => ({
          ...s,
          submittedAt: s.submittedAt.toISOString(),
          updatedAt: s.updatedAt.toISOString()
        }))
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to fetch hunt";
    return apiError("Database operation failed. Please try again.", 500, detail);
  }
}
