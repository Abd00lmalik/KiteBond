import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { ScanPaymentsEthersABI } from "@/lib/contract";
import { CONTRACT_CONFIG } from "@/lib/contractConfig";
import { prisma } from "@/lib/db";
import { analyzeWithHeurist, buildFallbackAnalysis } from "@/lib/heurist";
import { computeRiskLevel, computeRiskScore, computeRiskSignals } from "@/lib/heuristics";
import { toJsonValue } from "@/lib/json";
import { fetchNpmMeta } from "@/lib/npm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

type ScanDepth = "quick" | "standard" | "deep";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      packageName?: string;
      version?: string;
      scanDepth?: ScanDepth;
      walletAddress?: string;
      paymentTxHash?: string;
      onchainScanId?: string;
      isAgentSubmission?: boolean;
    };

    const packageName = body.packageName?.trim();
    const version = body.version?.trim() || "latest";
    const scanDepth = body.scanDepth || "quick";
    const walletAddress = body.walletAddress;
    const isAgentSubmission = body.isAgentSubmission === true;

    if (!packageName || !walletAddress) {
      return NextResponse.json({ error: "packageName and walletAddress required", code: "SCAN_INPUT_REQUIRED" }, { status: 400 });
    }

    const usage =
      (await prisma.userUsage.findUnique({ where: { walletAddress } })) ||
      (await prisma.userUsage.create({ data: { walletAddress, address: walletAddress } }));

    const price = getScanPrice(scanDepth);
    const isFreeQuick = scanDepth === "quick" && usage.freeScansUsed < 1;
    const paymentRequired = Number(price) > 0 && !isAgentSubmission;

    if (paymentRequired && !body.paymentTxHash) {
      return NextResponse.json(
        { error: "Payment required. Provide paymentTxHash after on-chain authorization.", code: "PAYMENT_REQUIRED" },
        { status: 402 }
      );
    }

    const onchainScanId =
      body.onchainScanId ||
      ethers.keccak256(ethers.toUtf8Bytes(`${walletAddress}:${packageName}:${version}:${Date.now()}`));

    const meta = await fetchNpmMeta(packageName, version);
    const deterministicSignals = computeRiskSignals(meta);

    let heuristResult;
    try {
      heuristResult = await analyzeWithHeurist(meta, deterministicSignals, scanDepth);
    } catch (error) {
      console.error("[Scan] Heurist failed:", error);
      heuristResult = buildFallbackAnalysis(
        meta,
        deterministicSignals,
        error instanceof Error ? error.message : "unknown Heurist failure"
      );
    }

    const signals = [...deterministicSignals, ...heuristResult.signals];
    const deterministicScore = computeRiskScore(signals);
    const riskScore = Math.max(deterministicScore, Math.min(heuristResult.riskScore, deterministicScore + 20));
    const riskLevel = computeRiskLevel(riskScore);

    const report = {
      packageName: meta.name,
      version: meta.version,
      riskScore,
      riskLevel,
      summary: heuristResult.summary,
      signals,
      finalRecommendation: heuristResult.finalRecommendation,
      confidence: heuristResult.confidence,
      methodology: heuristResult.methodology,
      limitations: heuristResult.limitations,
      metadata: {
        repository: meta.repository,
        license: meta.license,
        dependencyCount: meta.dependencyCount,
        hasInstallScripts: meta.hasInstallScript,
        publishedAt: meta.publishedAt,
        maintainerCount: meta.maintainers.length
      }
    };

    const reportHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(report)));
    const anchor = await anchorScanProof(onchainScanId, reportHash);
    const scan = await prisma.instantScan.create({
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
        proofHash: reportHash,
        reportHash,
        reportJson: toJsonValue(report),
        proofAnchored: anchor.anchored,
        severity: riskLevel,
        riskScore,
        riskLevel
      }
    });

    if (!isAgentSubmission) {
      await prisma.userUsage.update({
        where: { walletAddress },
        data: {
          freeScansUsed: isFreeQuick ? { increment: 1 } : undefined,
          scanCount: { increment: 1 },
          totalScans: { increment: 1 },
          lastScanAt: new Date()
        }
      });
    }

    return NextResponse.json({
      data: {
        scanId: scan.id,
        onchainScanId,
        report,
        reportHash,
        isFreeQuick,
        price,
        proofAnchored: anchor.anchored,
        proofTx: anchor.txHash,
        proofAnchorError: anchor.error
      }
    });
  } catch (err) {
    console.error("[/api/scan/instant] Unhandled error:", err instanceof Error ? err.message : err);
    const detail = err instanceof Error ? err.message : "Scan failed";
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
