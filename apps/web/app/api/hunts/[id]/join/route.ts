import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/hunts/[id]/join
// Records a stakeAndJoin event in the DB after the agent's on-chain tx confirms.
// Body: { agentAddress: string, txHash: string, stakedAmount?: string }
//
// This is called by the frontend after stakeAndJoin() tx confirms.
// It persists the AgentJoin record for DB-level stake verification fallback
// in the submit route when the RPC is unreachable.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as {
      agentAddress?: string;
      txHash?: string;
      stakedAmount?: string;
    };

    if (!body.agentAddress || !ethers.isAddress(body.agentAddress)) {
      return NextResponse.json({ error: "Valid agentAddress required", code: "JOIN_AGENT_REQUIRED" }, { status: 400 });
    }
    if (!body.txHash) {
      return NextResponse.json({ error: "txHash required", code: "JOIN_TX_REQUIRED" }, { status: 400 });
    }

    const numericId = Number(params.id);
    const hunt = await prisma.hunt.findFirst({
      where: Number.isFinite(numericId)
        ? { OR: [{ id: params.id }, { chainHuntId: numericId }, { onChainId: numericId }] }
        : { id: params.id }
    });

    if (!hunt) {
      return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    }
    if (hunt.status.toLowerCase() !== "open") {
      return NextResponse.json({ error: "Hunt is not open", code: "HUNT_NOT_OPEN" }, { status: 409 });
    }

    const normalizedAgent = body.agentAddress.toLowerCase();

    // Upsert — idempotent if called twice (e.g. tx mined twice from retry)
    const joinRecord = await prisma.agentJoin.upsert({
      where: { huntId_agentAddress: { huntId: hunt.id, agentAddress: normalizedAgent } },
      update: { txHash: body.txHash, stakedAmount: body.stakedAmount },
      create: {
        huntId: hunt.id,
        agentAddress: normalizedAgent,
        txHash: body.txHash,
        stakedAmount: body.stakedAmount ?? hunt.stakeRequired
      }
    });

    return NextResponse.json({
      success: true,
      joinId: joinRecord.id,
      huntId: hunt.id,
      agentAddress: normalizedAgent,
      txHash: body.txHash,
      stakedAmount: joinRecord.stakedAmount
    }, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to record join";
    console.error("[Join]", error);
    return apiError("Failed to record stake. Please try again.", 500, detail);
  }
}
