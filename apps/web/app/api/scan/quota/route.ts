import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim().toLowerCase();
  if (!address) {
    return NextResponse.json({ freeUsed: false, freeScansUsed: 0, totalScans: 0 });
  }

  try {
    const usage = await prisma.userUsage.findUnique({ where: { walletAddress: address } });
    return NextResponse.json({
      freeUsed: (usage?.freeScansUsed ?? 0) > 0,
      freeScansUsed: usage?.freeScansUsed ?? 0,
      totalScans: usage?.totalScans ?? usage?.scanCount ?? 0
    });
  } catch {
    return NextResponse.json({ freeUsed: false, freeScansUsed: 0, totalScans: 0 });
  }
}
