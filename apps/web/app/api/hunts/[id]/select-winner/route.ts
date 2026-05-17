import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { HUNT_REGISTRY_ADDRESS, HuntRegistryEthersABI, KITE_RPC_URL } from "@/lib/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HuntSubmissionRow = {
  id: string;
};

// AUTH: Reads wallet address from x-wallet-address header (Option A — header-based).
// Not cryptographically signed — appropriate for testnet. Upgrade to SIWE for production.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { submissionId } = (await req.json()) as { submissionId?: string };
    const callerAddress = req.headers.get("x-wallet-address")?.toLowerCase().trim();

    if (!submissionId) {
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
      include: { submissions: true }
    });

    if (!hunt) {
      return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    }
    if (hunt.creatorAddress.toLowerCase() !== callerAddress) {
      return NextResponse.json({ error: "Only hunt creator can select winner", code: "NOT_HUNT_CREATOR" }, { status: 403 });
    }

    const submissionIndex = hunt.submissions.findIndex((s: HuntSubmissionRow) => s.id === submissionId);
    if (submissionIndex < 0) {
      return NextResponse.json({ error: "Submission not found in this hunt", code: "SUBMISSION_NOT_FOUND" }, { status: 404 });
    }

    // --- On-chain winner selection (Case A) ---
    // Requires: DEPLOYER_PRIVATE_KEY env var and hunt.chainHuntId
    const key = process.env.DEPLOYER_PRIVATE_KEY;

    if (!key || !hunt.chainHuntId) {
      // Graceful DB-only fallback if contract call is not possible
      const note = !key ? "No server signer configured (DEPLOYER_PRIVATE_KEY missing)." : "Hunt has no on-chain ID — DB-only winner marking.";
      console.warn("[SelectWinner] On-chain call skipped:", note);

      await prisma.$transaction([
        prisma.submission.update({ where: { id: submissionId }, data: { status: "Winner" } }),
        prisma.hunt.update({
          where: { id: hunt.id },
          data: { status: "Settled", winnerAddress: hunt.submissions[submissionIndex].agentAddress, resolvedAt: new Date() }
        })
      ]);

      return NextResponse.json({
        success: true,
        submissionId,
        onChain: false,
        note: "Winner marked in database. On-chain settlement requires DEPLOYER_PRIVATE_KEY and a valid chainHuntId."
      });
    }

    // On-chain path — calls contract.selectWinner(chainHuntId, submissionIndex)
    const provider = new ethers.JsonRpcProvider(KITE_RPC_URL);
    const wallet = new ethers.Wallet(key, provider);
    const contract = new ethers.Contract(HUNT_REGISTRY_ADDRESS, HuntRegistryEthersABI, wallet);
    const tx = await contract.selectWinner(hunt.chainHuntId, submissionIndex);
    const receipt = await tx.wait();

    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "Winner", settlementTx: receipt.hash }
    });

    await prisma.hunt.update({
      where: { id: hunt.id },
      data: {
        status: "Settled",
        winnerAddress: updatedSubmission.agentAddress,
        settlementTx: receipt.hash,
        resolvedAt: new Date()
      }
    });

    return NextResponse.json({ success: true, submissionId, onChain: true, txHash: receipt.hash });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Winner selection failed";
    console.error("[SelectWinner]", error);
    return apiError("Winner selection failed. Please try again.", 500, detail);
  }
}
