import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const creator = req.nextUrl.searchParams.get("creator");

  const hunts = await prisma.hunt.findMany({
    where: {
      ...(status && status !== "All" ? { status } : {}),
      ...(creator ? { creatorAddress: creator } : {})
    },
    include: { submissions: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json({ data: hunts });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    chainHuntId?: number;
    creatorAddress?: string;
    packageName?: string;
    version?: string;
    scanDepth?: string;
    rewardAmount?: string;
    stakeRequired?: string;
    deadline?: string;
    termsHash?: string;
    metadataHash?: string;
    createdTx?: string;
  };

  const required = ["chainHuntId", "creatorAddress", "packageName", "version", "rewardAmount", "stakeRequired", "deadline", "createdTx"] as const;
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || body[key] === "") {
      return NextResponse.json({ error: `Missing ${key}`, code: "HUNT_INPUT_REQUIRED" }, { status: 400 });
    }
  }

  const hunt = await prisma.hunt.upsert({
    where: { chainHuntId: Number(body.chainHuntId) },
    update: {
      creatorAddress: body.creatorAddress!,
      packageName: body.packageName!,
      version: body.version!,
      scanDepth: body.scanDepth || "quick",
      rewardAmount: body.rewardAmount!,
      stakeRequired: body.stakeRequired!,
      deadline: new Date(body.deadline!),
      termsHash: body.termsHash,
      metadataHash: body.metadataHash,
      createdTx: body.createdTx,
      status: "Open"
    },
    create: {
      chainHuntId: Number(body.chainHuntId),
      creatorAddress: body.creatorAddress!,
      packageName: body.packageName!,
      version: body.version!,
      scanDepth: body.scanDepth || "quick",
      rewardAmount: body.rewardAmount!,
      stakeRequired: body.stakeRequired!,
      deadline: new Date(body.deadline!),
      termsHash: body.termsHash,
      metadataHash: body.metadataHash,
      createdTx: body.createdTx,
      status: "Open"
    }
  });

  await prisma.userUsage.upsert({
    where: { walletAddress: body.creatorAddress! },
    update: { huntCount: { increment: 1 } },
    create: { walletAddress: body.creatorAddress!, huntCount: 1 }
  });

  return NextResponse.json({ data: hunt });
}
