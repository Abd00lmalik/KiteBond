import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { prisma } from "@/lib/db";
import { HUNT_REGISTRY_ADDRESS, HuntRegistryEthersABI, KITE_RPC_URL } from "@/lib/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { submissionId, walletAddress } = (await req.json()) as {
    submissionId?: string;
    walletAddress?: string;
  };

  if (!submissionId || !walletAddress) {
    return NextResponse.json({ error: "submissionId and walletAddress required", code: "SELECT_INPUT_REQUIRED" }, { status: 400 });
  }

  const hunt = await prisma.hunt.findUnique({ where: { id: params.id }, include: { submissions: true } });
  if (!hunt) return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
  if (hunt.chainHuntId === null) {
    return NextResponse.json({ error: "Hunt is missing its on-chain ID", code: "CHAIN_HUNT_ID_MISSING" }, { status: 400 });
  }
  if (hunt.creatorAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "Only hunt creator can select winner", code: "NOT_HUNT_CREATOR" }, { status: 403 });
  }

  const submissionIndex = hunt.submissions.findIndex((submission) => submission.id === submissionId);
  if (submissionIndex < 0) {
    return NextResponse.json({ error: "Submission not found", code: "SUBMISSION_NOT_FOUND" }, { status: 404 });
  }

  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    return NextResponse.json({ error: "No server signer configured", code: "SIGNER_MISSING" }, { status: 500 });
  }

  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_KITE_RPC_URL || KITE_RPC_URL);
  const wallet = new ethers.Wallet(key, provider);
  const contract = new ethers.Contract(HUNT_REGISTRY_ADDRESS, HuntRegistryEthersABI, wallet);
  const tx = await contract.selectWinner(hunt.chainHuntId, submissionIndex);
  const receipt = await tx.wait();

  const updatedSubmission = await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "Winner", settlementTx: receipt.hash }
  });

  const updatedHunt = await prisma.hunt.update({
    where: { id: hunt.id },
    data: {
      status: "Settled",
      winnerAddress: updatedSubmission.agentAddress,
      settlementTx: receipt.hash
    },
    include: { submissions: true }
  });

  return NextResponse.json({ data: { hunt: updatedHunt, txHash: receipt.hash } });
}
