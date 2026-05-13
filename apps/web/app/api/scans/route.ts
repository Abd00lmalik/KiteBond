import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    const proofed = req.nextUrl.searchParams.get("proofed");

    const scans = await prisma.instantScan.findMany({
      where: {
        ...(wallet ? { userAddress: wallet } : {}),
        ...(proofed === "true" ? { proofTx: { not: null } } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return NextResponse.json({ data: scans });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list scans", code: "SCANS_LIST_ERROR" },
      { status: 500 }
    );
  }
}
