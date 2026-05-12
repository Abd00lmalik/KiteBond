import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || "Open";
  const hunts = await prisma.hunt.findMany({
    where: status === "All" ? {} : { status },
    include: { submissions: true },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({
    data: hunts.map((hunt) => ({
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
}
