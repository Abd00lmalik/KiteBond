import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const numericId = Number(params.id);
    const hunt = await prisma.hunt.findFirst({
      where: Number.isFinite(numericId)
        ? { OR: [{ id: params.id }, { chainHuntId: numericId }, { onChainId: numericId }] }
        : { id: params.id },
      include: {
        submissions: {
          orderBy: { submittedAt: "desc" }
        }
      }
    });

    if (!hunt) {
      return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      data: hunt.submissions.map((submission) => ({
        id: submission.id,
        agentAddress: submission.agentAddress,
        status: submission.status,
        reportJson: submission.reportJson,
        submittedAt: submission.submittedAt.toISOString(),
        verifierResult: submission.verifierResult,
        settlementTx: submission.settlementTx
      }))
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to list submissions";
    return apiError("Database operation failed. Please try again.", 500, detail);
  }
}
