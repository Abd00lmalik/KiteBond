import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentHuntRow = {
  id: string;
  chainHuntId: number | null;
  packageName: string;
  version: string;
  rewardAmount: string;
  stakeRequired: string;
  deadline: Date;
  submissions: unknown[];
  status: string;
};

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status") || "Open";
    const hunts = await prisma.hunt.findMany({
      where: status === "All" ? {} : { status },
      include: { submissions: true },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({
      data: hunts.map((hunt: AgentHuntRow) => ({
        id: hunt.id,
        chainHuntId: hunt.chainHuntId,
        packageName: hunt.packageName,
        version: hunt.version,
        rewardAmount: parseUnits(hunt.rewardAmount, 18).toString(),
        stakeRequired: parseUnits(hunt.stakeRequired, 18).toString(),
        deadline: hunt.deadline.toISOString(),
        submissionCount: hunt.submissions.length,
        status: hunt.status
      }))
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to list agent hunts";
    return apiError("Database operation failed. Please try again.", 500, detail);
  }
}
