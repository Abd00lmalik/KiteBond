import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { ScanPaymentsEthersABI } from "@/lib/contract";
import { CONTRACT_CONFIG } from "@/lib/contractConfig";
import { prisma } from "@/lib/db";
import { analyzePackageWithHeurist } from "@/lib/heurist";
import { computeRiskLevel, computeRiskScore, computeRiskSignals } from "@/lib/heuristics";
import { toJsonValue } from "@/lib/json";
import { fetchNpmMeta } from "@/lib/npm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ScanDepth = "quick" | "standard" | "deep";

type ScanStage = "auth" | "resolve" | "analyze" | "anchor" | "complete";

function stageError(stage: ScanStage, error: string, status = 500) {
  return NextResponse.json({ success: false, stage, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      packageName?: string;
      package?: string;
      version?: string;
      scanDepth?: ScanDepth;
      walletAddress?: string;
      address?: string;
      paymentTxHash?: string;
      onchainScanId?: string;
    };

    const packageName = (body.packageName || body.package || "").trim();
    const version = body.version?.trim() || "latest";
    const scanDepth = body.scanDepth || "quick";
    const walletAddress = (body.walletAddress || body.address || "").trim();

    if (!packageName || !walletAddress) {
      return stageError("auth", "packageName and walletAddress required.", 400);
    }

    let usage;
    try {
      usage =
        (await prisma.userUsage.findUnique({ where: { walletAddress } })) ||
        (await prisma.userUsage.create({ data: { walletAddress, address: walletAddress } }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown database error";
      return apiError("Database operation failed. Please try again.", 500, detail);
    }

    const price = getScanPrice(scanDepth);
    const isFreeQuick = scanDepth === "quick" && usage.freeScansUsed < 1;
    const paymentRequired = Number(price) > 0;
    if (paymentRequired && !body.paymentTxHash) {
      return stageError("auth", "Payment required. Approve USDT to continue.", 402);
    }

    let meta;
    try {
      meta = await fetchNpmMeta(packageName, version);
    } catch (error) {
      return stageError("resolve", error instanceof Error ? error.message : "Package lookup failed.", 404);
    }

    const deterministicSignals = computeRiskSignals(meta);
    const heurist = await analyzePackageWithHeurist(meta.name, {
      version: meta.version,
      description: meta.description || "",
      author: meta.author || "unknown",
      weeklyDownloads: 0,
      publishedAt: meta.publishedAt || "",
      maintainerCount: meta.maintainers.length,
      hasTypes: meta.keywords.some((keyword) => keyword.toLowerCase().includes("typescript")),
      licenseType: meta.license || "unknown"
    });

    const riskScore = Math.max(computeRiskScore(deterministicSignals), heurist.riskScore);
    const riskLevel = computeRiskLevel(riskScore);
    const report = {
      summary: heurist.summary,
      severity: heurist.severity,
      details: heurist.details,
      riskScore,
      flags: Array.from(new Set([...heurist.flags, ...deterministicSignals.map((signal) => signal.type)])),
      riskLevel
    };

    const onchainScanId =
      body.onchainScanId ||
      ethers.keccak256(ethers.toUtf8Bytes(`${walletAddress}:${meta.name}:${meta.version}:${scanDepth}:${Date.now()}`));
    const proofHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ meta, report })));
    const anchor = await anchorScanProof(onchainScanId, proofHash);

    try {
      await prisma.instantScan.create({
        data: {
          userAddress: walletAddress,
          address: walletAddress,
          packageName: meta.name,
          version: meta.version,
          packageVersion: meta.version,
          scanDepth,
          paid: paymentRequired,
          isPaid: paymentRequired,
          amountPaid: paymentRequired ? price : "0",
          paymentTx: body.paymentTxHash ?? null,
          proofTx: anchor.txHash,
          proofTxHash: anchor.txHash,
          scanId: onchainScanId,
          proofHash,
          reportHash: proofHash,
          reportJson: toJsonValue(report),
          proofAnchored: anchor.anchored,
          severity: riskLevel,
          riskScore,
          riskLevel
        }
      });

      await prisma.userUsage.update({
        where: { walletAddress },
        data: {
          freeScansUsed: isFreeQuick ? { increment: 1 } : undefined,
          scanCount: { increment: 1 },
          totalScans: { increment: 1 },
          lastScanAt: new Date()
        }
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown database error";
      return apiError("Database operation failed. Please try again.", 500, detail);
    }

    return NextResponse.json({
      success: true,
      stage: "complete",
      data: {
        packageMeta: {
          name: meta.name,
          version: meta.version,
          description: meta.description,
          author: meta.author,
          publishedAt: meta.publishedAt,
          weeklyDownloads: 0
        },
        signals: { score: riskScore, flags: report.flags },
        report,
        proofHash,
        proofTxHash: anchor.txHash,
        proofAnchored: anchor.anchored
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown scan error";
    return apiError("Scan failed. Please try again.", 500, detail);
  }
}

async function anchorScanProof(scanId: string, reportHash: string): Promise<{ anchored: boolean; txHash: string | null; error?: string }> {
  const privateKey =
    process.env.SERVICE_AGENT_PRIVATE_KEY ||
    process.env.VERIFIER_AGENT_PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    return { anchored: false, txHash: null, error: "No service key configured for server-side anchoring." };
  }

  try {
    const provider = new ethers.JsonRpcProvider(CONTRACT_CONFIG.rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(CONTRACT_CONFIG.scanPayments, ScanPaymentsEthersABI, wallet);
    const tx = await contract.anchorProof(scanId, reportHash);
    const receipt = await tx.wait();
    return { anchored: true, txHash: receipt?.hash || tx.hash };
  } catch (error) {
    console.error("[Scan] Non-fatal proof anchoring failed:", error instanceof Error ? error.message : error);
    return {
      anchored: false,
      txHash: null,
      error: error instanceof Error ? error.message : "Proof anchoring failed."
    };
  }
}

function getScanPrice(depth: string): string {
  const prices: Record<string, string> = {
    quick: process.env.INSTANT_SCAN_QUICK_PRICE || "0",
    standard: process.env.INSTANT_SCAN_STANDARD_PRICE || "1",
    deep: process.env.INSTANT_SCAN_DEEP_PRICE || "3"
  };
  return prices[depth] ?? "0";
}
