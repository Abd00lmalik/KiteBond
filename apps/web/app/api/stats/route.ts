import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalScans, scansToday, openHunts, hunts, settledHunts, agentsActive] = await Promise.all([
      prisma.instantScan.count(),
      prisma.instantScan.count({ where: { createdAt: { gte: today } } }),
      prisma.hunt.count({ where: { status: "Open" } }),
      prisma.hunt.findMany({ select: { stakeRequired: true } }),
      prisma.hunt.count({ where: { status: "Settled" } }),
      prisma.agentProfile.count()
    ]);

    const totalBonded = hunts.reduce((sum, hunt) => sum + Number(hunt.stakeRequired || 0), 0).toFixed(2);
    const payload = { totalScans, scansToday, openHunts, settledHunts, agentsActive, totalBonded };
    return NextResponse.json({ data: payload, ...payload });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load protocol stats",
        code: "STATS_LOAD_FAILED"
      },
      { status: 500 }
    );
  }
}
