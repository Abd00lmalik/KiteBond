import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { coerceOnChainId, decodeHuntCreatedFromTx, fallbackPackageLabel, fallbackVersionLabel } from "@/lib/huntSync";

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
    let parsedPackageName = body.packageName?.trim() || "";
    let parsedVersion = body.version?.trim() || "";
    let scanDepth = body.scanDepth || "instant";
    let termsHash = body.termsHash;
    let metadataHash = body.metadataHash;
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
      if (!parsedPackageName) parsedPackageName = fallbackPackageLabel(decoded.packageNameHash);
      if (!parsedVersion) parsedVersion = fallbackVersionLabel(decoded.versionHash);
      if (!body.scanDepth && decoded.scanDepth) scanDepth = decoded.scanDepth;
      if (!termsHash && decoded.termsHash) termsHash = decoded.termsHash;
      if (!metadataHash && decoded.packageNameHash) metadataHash = decoded.packageNameHash;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      decodeLog.push(message);
      console.error("[Hunt Sync] Receipt parse failed:", message);
    }

    console.log("[Hunt Sync] onChainId parsed:", onChainId);
    console.log("[Hunt Sync] packageName:", parsedPackageName || "(hash-only fallback unavailable)");

    if (onChainId === null) {
      console.error("[Hunt Sync] Cannot index without on-chain id.", { txHash, decodeLog });
      return NextResponse.json(
        {
          success: false,
          synced: false,
          hunt: null,
          error: "Could not recover on-chain hunt id from transaction receipt.",
          decodeLog
        },
        { status: 422 }
      );
    }

    if (!deadline) {
      console.error("[Hunt Sync] Cannot index without deadline.", { txHash, decodeLog });
      return NextResponse.json(
        {
          success: false,
          synced: false,
          hunt: null,
          error: "Could not recover hunt deadline from transaction receipt.",
          decodeLog
        },
        { status: 422 }
      );
    }

    const huntData = {
      chainId: 2368,
      chainHuntId: onChainId,
      creatorAddress: creatorAddress || "unknown",
      packageName: parsedPackageName || `package-hash:${txHash.slice(2, 10)}`,
      version: parsedVersion || "version-hash:unknown",
      scanDepth,
      rewardAmount: rewardAmount || "0",
      stakeRequired: stakeRequired || "0",
      stakeAmount: stakeRequired || "0",
      deadline: new Date(deadline),
      termsHash,
      metadataHash,
      createdTx: txHash,
      txHash,
      status: "Open"
    };

    const existingByTx = await prisma.hunt.findUnique({ where: { txHash } });
    const hunt = existingByTx
      ? await prisma.hunt.update({ where: { id: existingByTx.id }, data: { ...huntData, onChainId } })
      : await prisma.hunt.upsert({
          where: { onChainId },
          update: huntData,
          create: {
            ...huntData,
            onChainId
          }
        });

    return NextResponse.json({ success: true, synced: true, hunt, decodeLog });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown hunt sync error";
    console.error("[Hunt Sync] DB/indexing failure:", detail);
    return apiError("Hunt sync failed. Please try again.", 500, detail);
  }
}
