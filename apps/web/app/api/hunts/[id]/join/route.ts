import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { prisma } from "@/lib/db";
import { verifyOnChainStake } from "@/lib/stake-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let safeBody: Record<string, unknown> = {};
  try {
    const body = (await req.json()) as {
      agentAddress?: string;
      txHash?: string;
      stakedAmount?: string;
    };
    safeBody = { agentAddress: body.agentAddress, txHash: body.txHash, stakedAmount: body.stakedAmount };

    const { agentAddress, txHash, stakedAmount } = body;

    if (!agentAddress || !ethers.isAddress(agentAddress)) {
      return NextResponse.json({ error: "missing_field", message: "Valid agentAddress required" }, { status: 400 });
    }
    if (!txHash) {
      return NextResponse.json({ error: "missing_field", message: "txHash required" }, { status: 400 });
    }

    const numericId = Number(params.id);
    const hunt = await prisma.hunt.findFirst({
      where: Number.isFinite(numericId)
        ? { OR: [{ id: params.id }, { chainHuntId: numericId }, { onChainId: numericId }] }
        : { id: params.id }
    });

    if (!hunt) {
      return NextResponse.json({ error: "not_found", message: "Hunt not found" }, { status: 404 });
    }
    if (hunt.status.toLowerCase() !== "open") {
      return NextResponse.json({ error: "conflict", message: "Hunt is not open" }, { status: 409 });
    }

    const normalizedAgent = agentAddress.toLowerCase();

    // Verify on-chain stake status
    let onChainStaked = false;
    try {
      if (hunt.chainHuntId !== null && hunt.chainHuntId !== undefined) {
        onChainStaked = await verifyOnChainStake(hunt.chainHuntId, agentAddress);
      } else if (hunt.onChainId !== null && hunt.onChainId !== undefined) {
        onChainStaked = await verifyOnChainStake(hunt.onChainId, agentAddress);
      } else {
         onChainStaked = Boolean(txHash); // Fallback for pure DB hunts
      }
    } catch (err) {
      console.warn("[Join][onchain-check] failed, proceeding with tx hash only:", err instanceof Error ? err.message : err);
      onChainStaked = Boolean(txHash);
    }

    // Upsert — idempotent if called twice
    const joinRecord = await prisma.agentJoin.upsert({
      where: { huntId_agentAddress: { huntId: hunt.id, agentAddress: normalizedAgent } },
      create: {
        huntId: hunt.id,
        agentAddress: normalizedAgent,
        txHash: txHash ?? null,
        stakedAmount: stakedAmount ?? hunt.stakeRequired,
        onChainStaked
      },
      update: {
        txHash: txHash ?? undefined,
        stakedAmount: stakedAmount ?? undefined,
        onChainStaked: onChainStaked || undefined // don't overwrite true with false
      }
    });

    console.log("[Join][success]", { huntId: hunt.id, agentAddress: normalizedAgent, onChainStaked });

    return NextResponse.json({
      success: true,
      onChainStaked,
      indexed: true,
      joinId: joinRecord.id,
      huntId: hunt.id,
      agentAddress: normalizedAgent,
      txHash,
      stakedAmount: joinRecord.stakedAmount
    }, { status: 201 });

  } catch (err) {
    console.error("[Join][error]", {
      params,
      body: safeBody,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined
    });

    return NextResponse.json(
      {
        success: false,
        onChainStaked: false,
        indexed: false,
        error: "index_failed",
        message: "Stake indexing failed. If your stake transaction confirmed on-chain, you may still submit your report."
      },
      { status: 500 }
    );
  }
}
