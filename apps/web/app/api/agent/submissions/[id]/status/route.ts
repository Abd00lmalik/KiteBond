import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const submission = await prisma.submission.findUnique({ where: { id: params.id } });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found", code: "SUBMISSION_NOT_FOUND" }, { status: 404 });
    }

    const verifierReport =
      typeof submission.verifierReport === "object" && submission.verifierReport !== null
        ? (submission.verifierReport as { reasons?: unknown })
        : null;
    const verifierReasons = Array.isArray(verifierReport?.reasons)
      ? verifierReport.reasons.filter((reason): reason is string => typeof reason === "string")
      : [];

    return NextResponse.json({
      data: {
        status: submission.status,
        verifierResult: submission.verifierResult,
        verifierReasons,
        settlementTx: submission.settlementTx
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to fetch submission status";
    return apiError("Database operation failed. Please try again.", 500, detail);
  }
}
