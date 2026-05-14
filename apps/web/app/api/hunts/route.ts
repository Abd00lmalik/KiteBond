import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status");
    const creator = req.nextUrl.searchParams.get("creator");
    const statusFilter = status && status !== "All"
      ? Array.from(new Set([status, status.toLowerCase(), status.charAt(0).toUpperCase() + status.slice(1)]))
      : null;

    const hunts = await prisma.hunt.findMany({
      where: {
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
        ...(creator ? { creatorAddress: creator } : {})
      },
      include: { submissions: true },
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

    const onChainId = Number(body.onChainId ?? body.chainHuntId);
    if (!Number.isFinite(onChainId)) {
      return NextResponse.json({ error: "Missing onChainId", code: "HUNT_INPUT_REQUIRED" }, { status: 400 });
    }

    let hunt;
    try {
      hunt = await prisma.hunt.upsert({
        where: { onChainId },
        update: {
          chainId: 2368,
          chainHuntId: onChainId,
          creatorAddress: body.creatorAddress!,
          packageName: body.packageName!,
          version: body.version!,
          scanDepth: body.scanDepth || "quick",
          rewardAmount: body.rewardAmount!,
          stakeRequired: body.stakeRequired!,
          stakeAmount: body.stakeRequired!,
          deadline: new Date(body.deadline!),
          termsHash: body.termsHash,
          metadataHash: body.metadataHash,
          createdTx: body.createdTx,
          txHash: body.createdTx,
          status: "Open"
        },
        create: {
          chainId: 2368,
          chainHuntId: onChainId,
          onChainId,
          creatorAddress: body.creatorAddress!,
          packageName: body.packageName!,
          version: body.version!,
          scanDepth: body.scanDepth || "quick",
          rewardAmount: body.rewardAmount!,
          stakeRequired: body.stakeRequired!,
          stakeAmount: body.stakeRequired!,
          deadline: new Date(body.deadline!),
          termsHash: body.termsHash,
          metadataHash: body.metadataHash,
          createdTx: body.createdTx,
          txHash: body.createdTx,
          status: "Open"
        }
      });
    } catch (error) {
      const dbError = error instanceof Error ? error.message : "Unknown DB error";
      console.error("[Hunt] DB save failed after on-chain success:", dbError);
      return NextResponse.json({
        success: true,
        onChainSuccess: true,
        dbSaved: false,
        dbError,
        txHash: body.createdTx,
        onChainId: String(onChainId),
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
      txHash: body.createdTx,
      onChainId: String(onChainId),
      message: "Hunt created and indexed successfully.",
      data: hunt
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to create hunt";
    return apiError("Hunt creation failed. Please try again.", 500, detail);
  }
}
