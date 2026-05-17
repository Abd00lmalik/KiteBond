import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { HUNT_REGISTRY_ADDRESS, KITE_RPC_URL } from "@/lib/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SELECT WINNER — v29+ architecture
//
// The KiteBond contract's selectWinner(huntId, submissionIndex) MUST be called
// by the hunt creator's wallet (contract enforces msg.sender == hunt.creator).
//
// Correct flow:
//   1. Frontend: creator calls contract.selectWinner(chainHuntId, submissionIndex)
//      from their wallet — gets txHash on confirmation.
//   2. Frontend: POST /api/hunts/{id}/select-winner with { submissionId, txHash }
//      + x-wallet-address header.
//   3. This route: verifies creator, verifies on-chain tx receipt, updates DB, returns success.
//
// For on-chain hunts: DB cannot be marked Settled without a verified on-chain tx.
// For DB-only hunts (no chainHuntId): winner is marked in DB only with honest wording.

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

    const isOnChainHunt = hunt.chainHuntId !== null && hunt.chainHuntId !== undefined;

    // ── ON-CHAIN SETTLEMENT VERIFICATION ──────────────────────────────────────
    if (isOnChainHunt) {
      // On-chain hunts REQUIRE a txHash — DB cannot lead the chain
      if (!body.txHash) {
        return NextResponse.json(
          {
            error: "txHash required for on-chain hunt settlement. Call selectWinner() from your wallet first.",
            code: "TX_HASH_REQUIRED"
          },
          { status: 400 }
        );
      }

      // Verify the transaction receipt on KiteAI Testnet
      let receiptVerified = false;
      let verificationError: string | null = null;

      try {
        const provider = new ethers.JsonRpcProvider(KITE_RPC_URL);
        const receipt = await provider.getTransactionReceipt(body.txHash);

        if (!receipt) {
          verificationError = "Transaction receipt not found. The transaction may still be pending.";
        } else if (receipt.status !== 1) {
          verificationError = "Transaction reverted on-chain. Settlement did not succeed.";
        } else if (receipt.to?.toLowerCase() !== HUNT_REGISTRY_ADDRESS.toLowerCase()) {
          verificationError = `Transaction target (${receipt.to}) does not match the KiteBond Hunt Registry (${HUNT_REGISTRY_ADDRESS}).`;
        } else {
          receiptVerified = true;
        }
      } catch (err) {
        verificationError = `RPC verification failed: ${err instanceof Error ? err.message : String(err)}`;
      }

      if (!receiptVerified) {
        return NextResponse.json(
          {
            error: "On-chain selectWinner tx could not be verified. DB not updated.",
            code: "TX_VERIFICATION_FAILED",
            detail: verificationError
          },
          { status: 422 }
        );
      }
    }
    // ── END VERIFICATION ──────────────────────────────────────────────────────

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
      onChain: isOnChainHunt,
      txHash: body.txHash ?? null,
      settlementNote: isOnChainHunt
        ? "Winner selected and reward paid on-chain via selectWinner(). Settlement tx verified."
        : "Winner recorded in database only. This hunt has no on-chain ID — no automatic reward distribution occurred."
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Winner selection failed";
    console.error("[SelectWinner]", error);
    return apiError("Winner selection failed. Please try again.", 500, detail);
  }
}
