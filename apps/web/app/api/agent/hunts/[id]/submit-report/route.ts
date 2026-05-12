import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toJsonValue } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json()) as {
    agentAddress?: string;
    stakeTxHash?: string;
    reportHash?: string;
    reportJson?: unknown;
    submitTxHash?: string;
  };

  if (!body.agentAddress || !body.reportHash || !body.reportJson) {
    return NextResponse.json({ error: "agentAddress, reportHash and reportJson required", code: "SUBMISSION_INPUT_REQUIRED" }, { status: 400 });
  }

  const hunt = await prisma.hunt.findUnique({ where: { id: params.id } });
  if (!hunt) return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });

  const submission = await prisma.submission.create({
    data: {
      huntId: hunt.id,
      agentAddress: body.agentAddress,
      stakeTx: body.stakeTxHash,
      reportHash: body.reportHash,
      reportJson: toJsonValue(body.reportJson),
      status: "Submitted",
      settlementTx: body.submitTxHash
    }
  });

  await prisma.agentProfile.upsert({
    where: { address: body.agentAddress },
    update: { totalSubmitted: { increment: 1 } },
    create: { address: body.agentAddress, totalSubmitted: 1 }
  });

  try {
    await fetch(new URL("/api/verifier/verify-submission", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: submission.id })
    });
  } catch (error) {
    console.error("[Verifier] Submission verification trigger failed:", error);
  }

  return NextResponse.json({ data: submission });
}
