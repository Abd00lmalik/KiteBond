import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
}
