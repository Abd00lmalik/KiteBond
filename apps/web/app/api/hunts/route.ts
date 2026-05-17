import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { coerceOnChainId, decodeHuntCreatedFromTx } from "@/lib/huntSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status");
    const creator = req.nextUrl.searchParams.get("creator")?.trim().toLowerCase();
    const statusFilter = status && status !== "All"
      ? Array.from(new Set([status, status.toLowerCase(), status.charAt(0).toUpperCase() + status.slice(1)]))
      : null;

    const hunts = await prisma.hunt.findMany({
      where: {
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
        ...(creator ? { creatorAddress: { equals: creator, mode: "insensitive" } } : {})
      },
      include: {
        submissions: true,
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      chainHuntId?: number;
      onChainId?: number;
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

    const required = ["creatorAddress", "packageName", "version", "rewardAmount", "stakeRequired", "deadline", "createdTx"] as const;
    for (const key of required) {
      if (body[key] === undefined || body[key] === null || body[key] === "") {
        return NextResponse.json({ error: `Missing ${key}`, code: "HUNT_INPUT_REQUIRED" }, { status: 400 });
      }
    }

    const txHash = body.createdTx!.trim();
    const requestedOnChainId = coerceOnChainId(body.onChainId ?? body.chainHuntId);
    let resolvedOnChainId = requestedOnChainId;
    let creatorAddress = body.creatorAddress!;
    let rewardAmount = body.rewardAmount!;
    let stakeRequired = body.stakeRequired!;
    let deadline = body.deadline!;
    const decodeLog: string[] = [];

    try {
      const decoded = await decodeHuntCreatedFromTx(txHash);
      decodeLog.push(...decoded.decodeLog);
      if (decoded.onChainId !== null) resolvedOnChainId = decoded.onChainId;
      if (decoded.creatorAddress) creatorAddress = decoded.creatorAddress;
      if ((!rewardAmount || rewardAmount === "0") && decoded.rewardAmount) rewardAmount = decoded.rewardAmount;
      if ((!stakeRequired || stakeRequired === "0") && decoded.stakeRequired) stakeRequired = decoded.stakeRequired;
      if (!body.deadline && decoded.deadlineIso) deadline = decoded.deadlineIso;
    } catch (error) {
      decodeLog.push(error instanceof Error ? error.message : String(error));
    }

    let hunt;
    try {
      if (resolvedOnChainId !== null) {
        const data = {
            chainId: 2368,
            chainHuntId: resolvedOnChainId,
            creatorAddress,
            packageName: body.packageName!,
            version: body.version!,
            scanDepth: body.scanDepth || "instant",
            rewardAmount,
            stakeRequired,
            stakeAmount: stakeRequired,
            deadline: new Date(deadline),
            termsHash: body.termsHash,
            metadataHash: body.metadataHash,
            createdTx: txHash,
            txHash,
            status: "Open"
          };
        const existingByTx = await prisma.hunt.findUnique({ where: { txHash } });
        hunt = existingByTx
          ? await prisma.hunt.update({ where: { id: existingByTx.id }, data: { ...data, onChainId: resolvedOnChainId } })
          : await prisma.hunt.upsert({
              where: { onChainId: resolvedOnChainId },
              update: data,
              create: {
                ...data,
                onChainId: resolvedOnChainId
              }
            });
      } else {
        const existingByTx = await prisma.hunt.findUnique({ where: { txHash } });
        if (existingByTx) {
          hunt = existingByTx;
        } else {
          hunt = await prisma.hunt.create({
            data: {
              chainId: 2368,
              chainHuntId: null,
              onChainId: null,
              creatorAddress,
              packageName: body.packageName!,
              version: body.version!,
              scanDepth: body.scanDepth || "instant",
              rewardAmount,
              stakeRequired,
              stakeAmount: stakeRequired,
              deadline: new Date(deadline),
              termsHash: body.termsHash,
              metadataHash: body.metadataHash,
              createdTx: txHash,
              txHash,
              status: "Open"
            }
          });
        }
      }
    } catch (error) {
      const dbError = error instanceof Error ? error.message : "Unknown DB error";
      console.error("[Hunt] DB save failed after on-chain success:", dbError);
      return NextResponse.json({
        success: true,
        onChainSuccess: true,
        dbSaved: false,
        dbError,
        txHash,
        onChainId: resolvedOnChainId !== null ? String(resolvedOnChainId) : null,
        decodeLog,
        message: "Hunt confirmed on-chain. Indexing failed - use Sync Hunt to retry."
      });
    }

    try {
      await prisma.userUsage.upsert({
        where: { walletAddress: body.creatorAddress! },
        update: { huntCount: { increment: 1 } },
        create: { walletAddress: body.creatorAddress!, address: body.creatorAddress!, huntCount: 1 }
      });
    } catch (error) {
      console.error("[Hunt] Usage counter update failed (non-fatal):", error instanceof Error ? error.message : error);
    }

    return NextResponse.json({
      success: true,
      onChainSuccess: true,
      dbSaved: true,
      txHash,
      onChainId: resolvedOnChainId !== null ? String(resolvedOnChainId) : null,
      decodeLog,
      message: "Hunt created and indexed successfully.",
      data: hunt
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to create hunt";
    return apiError("Hunt creation failed. Please try again.", 500, detail);
  }
}
