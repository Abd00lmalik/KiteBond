import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { prisma } from "@/lib/db";
import { analyzeWithHeurist } from "@/lib/heurist";
import { computeRiskLevel, computeRiskScore, computeRiskSignals } from "@/lib/heuristics";
import { toJsonValue } from "@/lib/json";
import { fetchNpmMeta } from "@/lib/npm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
      (await prisma.userUsage.create({ data: { walletAddress } }));

    const price = getScanPrice(scanDepth);
    const isFreeQuick = scanDepth === "quick" && !usage.freeScanUsed;
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
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Heurist analysis failed.",
          code: "HEURIST_FAILED",
          staticAnalysis: {
            packageName: meta.name,
            version: meta.version,
            signals: deterministicSignals,
            riskScore: computeRiskScore(deterministicSignals),
            riskLevel: computeRiskLevel(computeRiskScore(deterministicSignals))
          }
        },
        { status: 502 }
      );
    }

    const signals = [...deterministicSignals, ...heuristResult.signals];
    const riskScore = Math.max(computeRiskScore(signals), heuristResult.riskScore);
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
    const scan = await prisma.instantScan.create({
      data: {
        userAddress: walletAddress,
        packageName: meta.name,
        version: meta.version,
        scanDepth,
        paid: paymentRequired,
        amountPaid: paymentRequired ? price : "0",
        paymentTx: body.paymentTxHash ?? null,
        scanId: onchainScanId,
        reportHash,
        reportJson: toJsonValue(report),
        riskScore,
        riskLevel
      }
    });

    if (!isAgentSubmission) {
      await prisma.userUsage.update({
        where: { walletAddress },
        data: {
          freeScanUsed: isFreeQuick ? true : usage.freeScanUsed,
          scanCount: { increment: 1 }
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
        price
      }
    });
  } catch (err) {
    console.error("[/api/scan/instant] Unhandled error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed", code: "SCAN_FAILED" },
      { status: 500 }
    );
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
