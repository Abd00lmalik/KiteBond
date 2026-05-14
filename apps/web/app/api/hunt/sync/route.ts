import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { HuntRegistryEthersABI } from "@/lib/contract";
import { prisma } from "@/lib/db";

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

    let onChainId = body.onChainId !== undefined ? Number(body.onChainId) : undefined;
    let creatorAddress = body.creatorAddress;
    let rewardAmount = body.rewardAmount;
    let stakeRequired = body.stakeRequired;
    let deadline = body.deadline;
    let parsedPackageName = body.packageName;

    console.log("[Hunt Sync] txHash:", body.txHash ?? "(none)");
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

    if (body.txHash && onChainId === undefined) {
      const provider = new ethers.JsonRpcProvider("https://rpc-testnet.gokite.ai/");
      const receipt = await provider.getTransactionReceipt(body.txHash);
      console.log("[Hunt Sync] Receipt found:", !!receipt);
      console.log("[Hunt Sync] Logs count:", receipt?.logs?.length ?? 0);
      if (!receipt) {
        return NextResponse.json({ success: false, synced: false, hunt: null, error: "Transaction not found or not yet confirmed." }, { status: 404 });
      }

      const interfaces = [
        new ethers.Interface(HuntRegistryEthersABI),
        ...[
          "event HuntCreated(uint256 indexed huntId, address indexed creator, string packageName, uint256 stake)",
          "event TaskCreated(uint256 indexed taskId, address indexed creator, string packageName, uint256 amount)",
          "event BountyCreaed(uint256 indexed id, address creator, uint256 amount)",
          "event HuntPosted(uint256 indexed id, address indexed poster)"
        ].map((sig) => new ethers.Interface([sig]))
      ];

      for (const iface of interfaces) {
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed && ["HuntCreated", "TaskCreated", "BountyCreaed", "HuntPosted"].includes(parsed.name)) {
              onChainId = Number(parsed.args.huntId ?? parsed.args.taskId ?? parsed.args.id ?? parsed.args[0]);
              creatorAddress = creatorAddress || String(parsed.args.creator ?? parsed.args.owner ?? parsed.args.poster ?? receipt.from ?? "");
              parsedPackageName = parsedPackageName || (parsed.args.packageName ? String(parsed.args.packageName) : undefined);
              rewardAmount = rewardAmount || String(parsed.args.rewardAmount ?? parsed.args.amount ?? "");
              stakeRequired = stakeRequired || String(parsed.args.stakeRequired ?? parsed.args.stake ?? parsed.args.amount ?? "");
              deadline = deadline || new Date(Number(parsed.args.deadline ?? 0n) * 1000).toISOString();
              break;
            }
          } catch {
            // Try the next event signature/log combination.
          }
        }
        if (onChainId !== undefined && Number.isFinite(onChainId)) break;
      }
    }

    console.log("[Hunt Sync] onChainId parsed:", onChainId);
    console.log("[Hunt Sync] packageName:", parsedPackageName ?? body.packageName ?? "(unknown)");

    if ((onChainId === undefined || !Number.isFinite(onChainId)) && !body.txHash) {
      return NextResponse.json({ success: false, synced: false, hunt: null, error: "txHash or onChainId is required for hunt sync." }, { status: 400 });
    }

    const huntData = {
      chainId: 2368,
      chainHuntId: onChainId,
      creatorAddress: creatorAddress || "unknown",
      packageName: parsedPackageName || `unknown-${onChainId ?? body.txHash?.slice(2, 10) ?? "hunt"}`,
      version: body.version || "unknown",
      scanDepth: body.scanDepth || "instant",
      rewardAmount: rewardAmount || "0",
      stakeRequired: stakeRequired || "0",
      stakeAmount: stakeRequired || "0",
      deadline: deadline ? new Date(deadline) : new Date(),
      termsHash: body.termsHash,
      metadataHash: body.metadataHash,
      createdTx: body.txHash,
      txHash: body.txHash,
      status: "Open"
    };

    let hunt;
    if (onChainId !== undefined && Number.isFinite(onChainId)) {
      hunt = await prisma.hunt.upsert({
        where: { onChainId },
        update: huntData,
        create: {
          ...huntData,
          chainHuntId: onChainId,
          onChainId
        }
      });
    } else {
      console.warn("[Hunt Sync] Event parse failed. Creating or loading record with txHash as key.");
      const existing = await prisma.hunt.findUnique({ where: { txHash: body.txHash } });
      hunt =
        existing ||
        (await prisma.hunt.create({
          data: {
            ...huntData,
            chainHuntId: null,
            onChainId: null
          }
        }));
    }

    return NextResponse.json({ success: true, synced: true, hunt });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown hunt sync error";
    return apiError("Hunt sync failed. Please try again.", 500, detail);
  }
}
