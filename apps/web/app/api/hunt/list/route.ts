import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compatibility endpoint: proxies open hunts for /api/hunt/list
// Avoids redirect CORS issues by returning data directly.
export async function GET() {
  try {
    const hunts = await prisma.hunt.findMany({
      where: { status: { in: ["Open", "open"] } },
      include: {
        submissions: { select: { id: true } },
        _count: { select: { submissions: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return NextResponse.json({ data: hunts });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to list hunts";
    return apiError("Database operation failed. Please try again.", 500, detail);
  }
}
