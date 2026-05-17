import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SELECT WINNER — v29 architecture
//
// The KiteBond contract's selectWinner(huntId, submissionIndex) MUST be called
// by the hunt creator's wallet (contract enforces msg.sender == hunt.creator).
// A server signer cannot call it unless it IS the creator.
//
// Correct flow:
//   1. Frontend: creator calls contract.selectWinner(chainHuntId, submissionIndex)
//      from their wallet — gets txHash on confirmation.
//   2. Frontend: POST /api/hunts/{id}/select-winner with { submissionId, txHash }
//      + x-wallet-address header.
//   3. This route: verifies creator, updates DB, returns success.
//
// The contract automatically pays the winner and returns losing stakes in the
// same selectWinner tx. No separate settlement call is needed.
//
// If hunt has no chainHuntId (DB-only), txHash is optional — marks DB-only winner.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as { submissionId?: string; txHash?: string };
    const callerAddress = req.headers.get("x-wallet-address")?.toLowerCase().trim();

    if (!body.submissionId) {
      return NextResponse.json({ error: "submissionId required", code: "SELECT_INPUT_REQUIRED" }, { status: 400 });
    }
    if (!callerAddress) {
      return NextResponse.json({ error: "x-wallet-address header required", code: "AUTH_REQUIRED" }, { status: 401 });
    }

    const numericId = Number(params.id);
    const hunt = await prisma.hunt.findFirst({
      where: Number.isFinite(numericId)
        ? { OR: [{ id: params.id }, { chainHuntId: numericId }, { onChainId: numericId }] }
        : { id: params.id },
      include: { submissions: { select: { id: true, agentAddress: true } } }
    });

    if (!hunt) {
      return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    }
    if (hunt.creatorAddress.toLowerCase() !== callerAddress) {
      return NextResponse.json({ error: "Only the hunt creator can select the winner", code: "NOT_HUNT_CREATOR" }, { status: 403 });
    }
    if (hunt.status.toLowerCase() === "settled") {
      return NextResponse.json({ error: "Hunt is already settled", code: "HUNT_ALREADY_SETTLED" }, { status: 409 });
    }

    const winningSubmission = hunt.submissions.find((s) => s.id === body.submissionId);
    if (!winningSubmission) {
      return NextResponse.json({ error: "Submission not found in this hunt", code: "SUBMISSION_NOT_FOUND" }, { status: 404 });
    }

    const onChain = Boolean(body.txHash && hunt.chainHuntId !== null);

    // Update DB: mark winner, settle hunt
    await prisma.$transaction([
      prisma.submission.update({
        where: { id: body.submissionId },
        data: {
          status: "Winner",
          ...(body.txHash ? { settlementTx: body.txHash } : {})
        }
      }),
      prisma.hunt.update({
        where: { id: hunt.id },
        data: {
          status: "Settled",
          winnerAddress: winningSubmission.agentAddress,
          resolvedAt: new Date(),
          ...(body.txHash ? { settlementTx: body.txHash } : {})
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      submissionId: body.submissionId,
      winnerAddress: winningSubmission.agentAddress,
      onChain,
      txHash: body.txHash ?? null,
      // Honest settlement note
      settlementNote: onChain
        ? "Winner selected and reward paid on-chain via selectWinner(). Stakes returned to non-winning agents automatically."
        : "Winner recorded in database. This hunt has no on-chain ID — no automatic reward distribution occurred."
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Winner selection failed";
    console.error("[SelectWinner]", error);
    return apiError("Winner selection failed. Please try again.", 500, detail);
  }
}
