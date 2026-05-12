import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const hunt = await prisma.hunt.findUnique({
    where: { id: params.id },
    include: { submissions: true }
  });

  if (!hunt) {
    return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      ...hunt,
      rewardAmount: parseUnits(hunt.rewardAmount, 18).toString(),
      stakeRequired: parseUnits(hunt.stakeRequired, 18).toString(),
      deadline: hunt.deadline.toISOString(),
      createdAt: hunt.createdAt.toISOString(),
      updatedAt: hunt.updatedAt.toISOString(),
      submissions: hunt.submissions.map((submission) => ({
        ...submission,
        submittedAt: submission.submittedAt.toISOString(),
        updatedAt: submission.updatedAt.toISOString()
      }))
    }
  });
}
