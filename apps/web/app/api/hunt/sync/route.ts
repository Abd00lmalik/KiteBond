import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { coerceOnChainId, decodeHuntCreatedFromTx } from "@/lib/huntSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      txHash?: string;
      onChainId?: number | string;
      creatorAddress?: string;
      packageName?: string;
      version?: string;
      scanDepth?: string;
      rewardAmount?: string;
      stakeRequired?: string;
      deadline?: string;
      termsHash?: string;
      metadataHash?: string;
    };

    if (!body.txHash?.trim()) {
      return NextResponse.json({ success: false, synced: false, hunt: null, error: "txHash is required for hunt sync." }, { status: 400 });
    }
    const txHash = body.txHash.trim();

    let onChainId = coerceOnChainId(body.onChainId);
    let creatorAddress = body.creatorAddress || "unknown";
    let rewardAmount = body.rewardAmount || "0";
    let stakeRequired = body.stakeRequired || "0";
    let deadline = body.deadline;
    let parsedPackageName = body.packageName || "";
    const decodeLog: string[] = [];

    console.log("[Hunt Sync] txHash:", txHash);
    console.log("[Hunt Sync] supplied onChainId:", onChainId);

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Database unreachable. Hunt exists on-chain. Retry sync after DB is restored."
        },
        { status: 503 }
      );
    }

    try {
      const decoded = await decodeHuntCreatedFromTx(txHash);
      decodeLog.push(...decoded.decodeLog);
      console.log("[Hunt Sync] Receipt found:", true);
      console.log("[Hunt Sync] Logs count:", decoded.rawLogCount);
      if (decoded.onChainId !== null) onChainId = decoded.onChainId;
      if (decoded.creatorAddress) creatorAddress = decoded.creatorAddress;
      if ((!rewardAmount || rewardAmount === "0") && decoded.rewardAmount) rewardAmount = decoded.rewardAmount;
      if ((!stakeRequired || stakeRequired === "0") && decoded.stakeRequired) stakeRequired = decoded.stakeRequired;
      if (!body.deadline && decoded.deadlineIso) deadline = decoded.deadlineIso;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      decodeLog.push(message);
      console.warn("[Hunt Sync] Receipt parse failed, falling back to provided payload:", message);
    }

    console.log("[Hunt Sync] onChainId parsed:", onChainId);
    console.log("[Hunt Sync] packageName:", parsedPackageName ?? body.packageName ?? "(unknown)");

    const huntData = {
      chainId: 2368,
      chainHuntId: onChainId,
      creatorAddress: creatorAddress || "unknown",
      packageName: parsedPackageName || `unknown-${onChainId ?? txHash.slice(2, 10)}`,
      version: body.version || "unknown",
      scanDepth: body.scanDepth || "instant",
      rewardAmount: rewardAmount || "0",
      stakeRequired: stakeRequired || "0",
      stakeAmount: stakeRequired || "0",
      deadline: deadline ? new Date(deadline) : new Date(),
      termsHash: body.termsHash,
      metadataHash: body.metadataHash,
      createdTx: txHash,
      txHash,
      status: "Open"
    };

    let hunt: Awaited<ReturnType<typeof prisma.hunt.create>>;
    if (onChainId !== null) {
      hunt = await prisma.hunt.upsert({
        where: { onChainId },
        update: huntData,
        create: {
          ...huntData,
          onChainId
        }
      });
    } else {
      const existingByTx = await prisma.hunt.findUnique({ where: { txHash } });
      hunt = existingByTx
        ? await prisma.hunt.update({ where: { id: existingByTx.id }, data: huntData })
        : await prisma.hunt.create({ data: { ...huntData, onChainId: null, chainHuntId: null } });
    }

    return NextResponse.json({ success: true, synced: true, hunt, decodeLog });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown hunt sync error";
    return apiError("Hunt sync failed. Please try again.", 500, detail);
  }
}
