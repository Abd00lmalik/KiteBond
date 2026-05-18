import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySelectWinnerTx } from "@/lib/verify-select-winner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SELECT WINNER — v35 architecture
//
// The KiteBond contract's selectWinner(huntId, submissionIndex) MUST be called
// by the hunt creator's wallet (contract enforces msg.sender == hunt.creator).
//
// Correct flow:
//   1. Frontend: creator calls contract.selectWinner(chainHuntId, submissionIndex)
//      from their wallet — waits for tx confirmation — gets txHash.
//   2. Frontend: POST /api/hunts/{id}/select-winner with { submissionId, txHash }
//      + x-wallet-address header.
//   3. This route: verifies creator, decodes calldata, verifies on-chain tx, updates DB.
//
// Verification order:
//   receipt status → contract address → sender → calldata decode → hunt ID match
//   WinnerSelected event is optional — calldata is the source of truth.

function selectWinnerErrorMessage(reason: string): string {
  const messages: Record<string, string> = {
    receipt_not_found: "Transaction not yet confirmed. Wait a few seconds and retry.",
    tx_reverted: "The winner selection transaction was reverted on-chain.",
    wrong_contract: "Transaction was sent to the wrong contract address.",
    wrong_sender: "Transaction sender does not match the hunt creator.",
    calldata_decode_failed: "Could not decode the transaction. Ensure you are using the correct contract.",
    wrong_function: "Transaction did not call the selectWinner function.",
    hunt_id_mismatch: "Transaction references a different hunt.",
    config_error: "Server configuration error — contract address not set.",
    tx_fetch_failed: "Could not fetch transaction data. The RPC may be unreachable."
  };
  return messages[reason] ?? "Winner selection could not be verified.";
}

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
      include: { submissions: { orderBy: { createdAt: "asc" }, select: { id: true, agentAddress: true, contractIndex: true } } }
    });

    if (!hunt) {
      return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    }
    if (hunt.creatorAddress.toLowerCase() !== callerAddress) {
      return NextResponse.json({ error: "Only the hunt creator can select the winner", code: "NOT_HUNT_CREATOR" }, { status: 403 });
    }

    // Idempotency — same tx already settled
    if (hunt.settlementTx === body.txHash && hunt.status.toLowerCase() === "settled") {
      return NextResponse.json({
        success: true,
        alreadySettled: true,
        submissionId: hunt.submissions.find(s => s.agentAddress === hunt.winnerAddress)?.id ?? body.submissionId,
        txHash: body.txHash
      });
    }

    if (hunt.status.toLowerCase() === "settled" && !body.txHash) {
      return NextResponse.json({ error: "Hunt is already settled", code: "HUNT_ALREADY_SETTLED" }, { status: 409 });
    }

    const isOnChainHunt = hunt.chainHuntId !== null && hunt.chainHuntId !== undefined;

    // ── ON-CHAIN SETTLEMENT VERIFICATION ──────────────────────────────────────
    if (isOnChainHunt) {
      if (!body.txHash) {
        return NextResponse.json(
          {
            error: "txHash required for on-chain hunt settlement. Call selectWinner() from your wallet first.",
            code: "TX_HASH_REQUIRED"
          },
          { status: 400 }
        );
      }

      const effectiveChainHuntId = hunt.chainHuntId ?? hunt.onChainId ?? null;
      const verification = await verifySelectWinnerTx(
        body.txHash as `0x${string}`,
        callerAddress,
        effectiveChainHuntId
      );

      if (!verification.ok) {
        console.error("[SelectWinner][verify-failed]", {
          huntId: hunt.id,
          txHash: body.txHash,
          reason: verification.reason,
          detail: verification.detail
        });
        return NextResponse.json(
          {
            error: "verification_failed",
            reason: verification.reason,
            message: selectWinnerErrorMessage(verification.reason),
            detail: verification.detail  // always include for agent debugging
          },
          { status: 422 }
        );
      }

      // Resolve winning submission from decoded on-chain submission index
      const { decodedSubmissionIndex } = verification;
      const indexNum = Number(decodedSubmissionIndex);

      // Primary: match by contractIndex field (set at submission time)
      let winningSubmission = hunt.submissions.find(s => s.contractIndex === indexNum) ?? null;

      // Fallback 1: positional index in creation order
      if (!winningSubmission) {
        winningSubmission = hunt.submissions[indexNum] ?? null;
        if (winningSubmission) {
          console.warn("[SelectWinner] resolved winner by position fallback — contractIndex field may be missing");
        }
      }

      // Fallback 2: submissionId provided in body
      if (!winningSubmission && body.submissionId) {
        winningSubmission = hunt.submissions.find(s => s.id === body.submissionId) ?? null;
        if (winningSubmission) {
          console.warn("[SelectWinner] resolved winner by submissionId body fallback — index resolution failed");
        }
      }

      if (!winningSubmission) {
        return NextResponse.json(
          {
            error: "submission_not_found",
            message: `No submission found at on-chain index ${indexNum} (${hunt.submissions.length} total submissions)`,
            code: "SUBMISSION_NOT_FOUND"
          },
          { status: 404 }
        );
      }

      // Update DB inside a transaction
      await prisma.$transaction([
        prisma.submission.update({
          where: { id: winningSubmission.id },
          data: { status: "Winner", settlementTx: body.txHash }
        }),
        prisma.hunt.update({
          where: { id: hunt.id },
          data: {
            status: "Settled",
            winnerAddress: winningSubmission.agentAddress,
            resolvedAt: new Date(),
            settlementTx: body.txHash
          }
        })
      ]);

      console.log("[SelectWinner][success]", {
        huntId: hunt.id,
        winningSubmissionId: winningSubmission.id,
        submissionIndex: indexNum,
        txHash: body.txHash
      });

      return NextResponse.json({
        success: true,
        submissionId: winningSubmission.id,
        winnerAddress: winningSubmission.agentAddress,
        onChain: true,
        txHash: body.txHash,
        settlementNote: "Winner selected and reward paid on-chain via selectWinner(). Settlement tx verified."
      });
    }

    // ── DB-ONLY HUNT (no chainHuntId) ─────────────────────────────────────────
    const winningSubmission = hunt.submissions.find(s => s.id === body.submissionId);
    if (!winningSubmission) {
      return NextResponse.json({ error: "Submission not found in this hunt", code: "SUBMISSION_NOT_FOUND" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.submission.update({
        where: { id: body.submissionId },
        data: { status: "Winner" }
      }),
      prisma.hunt.update({
        where: { id: hunt.id },
        data: {
          status: "Settled",
          winnerAddress: winningSubmission.agentAddress,
          resolvedAt: new Date()
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      submissionId: body.submissionId,
      winnerAddress: winningSubmission.agentAddress,
      onChain: false,
      txHash: null,
      settlementNote: "Winner recorded in database only. This hunt has no on-chain ID — no automatic reward distribution occurred."
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Winner selection failed";
    console.error("[SelectWinner][fatal]", error);
    return NextResponse.json(
      { error: "internal_error", message: "Settlement sync failed. Please retry.", detail },
      { status: 500 }
    );
  }
}
