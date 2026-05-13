import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { prisma } from "@/lib/db";
import { getVerifierWallet } from "@/lib/agents/verifierAgent";
import { HUNT_REGISTRY_ADDRESS, HuntRegistryEthersABI, KITE_RPC_URL } from "@/lib/contract";
import { toJsonValue } from "@/lib/json";
import { verifyReport } from "@/lib/verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { submissionId } = (await req.json()) as { submissionId?: string };
    if (!submissionId) {
      return NextResponse.json({ error: "submissionId required", code: "VERIFY_INPUT_REQUIRED" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { hunt: true }
    });
    if (!submission || !submission.reportHash || !submission.reportJson) {
      return NextResponse.json({ error: "Submission not ready", code: "SUBMISSION_NOT_READY" }, { status: 404 });
    }

    const result = verifyReport(
      submission.reportJson,
      submission.hunt.packageName,
      submission.hunt.version,
      submission.reportHash,
      submission.hunt.deadline
    );

    let txHash: string | undefined;
    if (submission.hunt.chainHuntId !== null && result.decision !== "needs_manual_review") {
      const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_KITE_RPC_URL || KITE_RPC_URL);
      const wallet = getVerifierWallet(provider);
      const contract = new ethers.Contract(HUNT_REGISTRY_ADDRESS, HuntRegistryEthersABI, wallet);
      const index = await prisma.submission.count({
        where: {
          huntId: submission.huntId,
          submittedAt: { lte: submission.submittedAt }
        }
      });
      const tx = await contract.verifySubmission(submission.hunt.chainHuntId, index - 1, result.passed, result.verificationHash);
      const receipt = await tx.wait();
      txHash = receipt.hash;
    }

    const status =
      result.decision === "valid"
        ? "VerifiedValid"
        : result.decision === "invalid"
          ? "Slashed"
          : "NeedsManualReview";

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status,
        verifierResult: result.passed,
        verifierReport: toJsonValue(result),
        verificationHash: result.verificationHash,
        verificationTx: txHash
      }
    });

    if (result.decision !== "needs_manual_review") {
      await prisma.agentProfile.upsert({
        where: { address: submission.agentAddress },
        update: result.passed ? { totalValid: { increment: 1 } } : { totalInvalid: { increment: 1 } },
        create: {
          address: submission.agentAddress,
          totalValid: result.passed ? 1 : 0,
          totalInvalid: result.passed ? 0 : 1
        }
      });
    }

    return NextResponse.json({ data: { submission: updated, ...result, txHash } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verifier failed", code: "VERIFY_SUBMISSION_ERROR" },
      { status: 500 }
    );
  }
}
