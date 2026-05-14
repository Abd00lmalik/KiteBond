import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { HuntRegistryEthersABI } from "@/lib/contract";
import { CONTRACT_CONFIG } from "@/lib/contractConfig";
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

    if (body.txHash && onChainId === undefined) {
      const provider = new ethers.JsonRpcProvider(CONTRACT_CONFIG.rpcUrl);
      const receipt = await provider.getTransactionReceipt(body.txHash);
      if (!receipt) {
        return NextResponse.json({ synced: false, hunt: null, error: "Transaction receipt not found yet." }, { status: 404 });
      }

      const iface = new ethers.Interface(HuntRegistryEthersABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "HuntCreated") {
            onChainId = Number(parsed.args.huntId ?? parsed.args.taskId ?? parsed.args.id);
            creatorAddress = creatorAddress || String(parsed.args.creator ?? parsed.args.owner ?? "");
            rewardAmount = rewardAmount || String(parsed.args.rewardAmount ?? "");
            stakeRequired = stakeRequired || String(parsed.args.stakeRequired ?? "");
            deadline = deadline || new Date(Number(parsed.args.deadline ?? 0n) * 1000).toISOString();
            break;
          }
        } catch {
          // Ignore logs from other contracts in the same transaction.
        }
      }
    }

    if (onChainId === undefined || !Number.isFinite(onChainId)) {
      return NextResponse.json({ synced: false, hunt: null, error: "Could not determine on-chain hunt id." }, { status: 400 });
    }

    const hunt = await prisma.hunt.upsert({
      where: { onChainId },
      update: {
        chainId: 2368,
        chainHuntId: onChainId,
        creatorAddress: creatorAddress || "unknown",
        packageName: body.packageName || `unknown-${onChainId}`,
        version: body.version || "unknown",
        scanDepth: body.scanDepth || "quick",
        rewardAmount: rewardAmount || "0",
        stakeRequired: stakeRequired || "0",
        stakeAmount: stakeRequired || "0",
        deadline: deadline ? new Date(deadline) : new Date(),
        termsHash: body.termsHash,
        metadataHash: body.metadataHash,
        createdTx: body.txHash,
        txHash: body.txHash,
        status: "Open"
      },
      create: {
        chainId: 2368,
        chainHuntId: onChainId,
        onChainId,
        creatorAddress: creatorAddress || "unknown",
        packageName: body.packageName || `unknown-${onChainId}`,
        version: body.version || "unknown",
        scanDepth: body.scanDepth || "quick",
        rewardAmount: rewardAmount || "0",
        stakeRequired: stakeRequired || "0",
        stakeAmount: stakeRequired || "0",
        deadline: deadline ? new Date(deadline) : new Date(),
        termsHash: body.termsHash,
        metadataHash: body.metadataHash,
        createdTx: body.txHash,
        txHash: body.txHash,
        status: "Open"
      }
    });

    return NextResponse.json({ synced: true, hunt });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown hunt sync error";
    return apiError("Hunt sync failed. Please try again.", 500, detail);
  }
}
