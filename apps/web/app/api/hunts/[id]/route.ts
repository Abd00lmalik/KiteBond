import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const numericId = Number(params.id);
  const hunt = await prisma.hunt.findFirst({
    where: Number.isFinite(numericId)
      ? { OR: [{ id: params.id }, { chainHuntId: numericId }] }
      : { id: params.id },
    include: { submissions: true }
  });

  if (!hunt) {
    return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ data: hunt });
}
