import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { analyzeDependencies } from "@/lib/dependencies";
import { prisma } from "@/lib/db";
import { analyzeDeepPackageWithHeurist } from "@/lib/heurist";
import type { RiskSignal, Severity } from "@/lib/heuristics";
import { toJsonValue } from "@/lib/json";
import { fetchNpmMeta } from "@/lib/npm";
import { verifyKitePaymentTx } from "@/lib/paymentVerification";
import { extractSignals } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

function stageError(stage: "auth" | "resolve" | "analyze" | "save", error: string, status = 500) {
  return NextResponse.json({ success: false, stage, error }, { status });
}

export async function POST(req: NextRequest) {
  let body: {
    package?: string;
    packageName?: string;
    address?: string;
    walletAddress?: string;
    version?: string;
    paymentTxHash?: string;
    onchainScanId?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }

  const rawPackageName = (body.package ?? body.packageName ?? "").trim().toLowerCase();
  if (!rawPackageName) return apiError("Package name is required.", 400);
  if (rawPackageName.length > 214 || /[\/\\<>]/.test(rawPackageName)) return apiError("Invalid package name.", 400);

  const packageName = rawPackageName.split("@")[0] || rawPackageName;
  const address = (body.address ?? body.walletAddress ?? "").trim().toLowerCase();
  if (!address) return stageError("auth", "Connect your wallet before Deep Scan.", 401);
  if (!body.paymentTxHash) return stageError("auth", "Payment required for Deep Scan.", 402);

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("[Deep Scan][Auth] DB ping failed:", err);
    return stageError("auth", "Database is not reachable. Check Vercel DATABASE_URL and Neon connection.", 503);
  }

  try {
    const paymentConfirmed = await verifyKitePaymentTx(body.paymentTxHash);
    if (!paymentConfirmed) return stageError("auth", "Payment transaction is not confirmed on KiteAI.", 402);
  } catch (err) {
    console.error("[Deep Scan][Auth] Payment verification failed:", err instanceof Error ? err.message : err);
    return stageError("auth", "Could not verify Deep Scan payment on KiteAI.", 502);
  }

  let meta;
  try {
    meta = await fetchNpmMeta(packageName, body.version ?? "latest");
  } catch (err) {
    return stageError("resolve", err instanceof Error ? err.message : "Failed to resolve package from npm registry.", 400);
  }

  const signals = extractSignals(meta, packageName);
  const dependencyRisk = await analyzeDependencies(meta.dependencies);
  const dependencyFlags = [
    `Direct dependencies: ${dependencyRisk.totalDeps}`,
    dependencyRisk.suspiciousDeps.length
      ? `Suspicious dependency names: ${dependencyRisk.suspiciousDeps.join(", ")}`
      : "No suspicious dependency naming patterns detected."
  ];

  let heuristReport;
  try {
    heuristReport = await analyzeDeepPackageWithHeurist(packageName, {
      version: meta.version,
      description: meta.description,
      author: meta.author,
      weeklyDownloads: meta.weeklyDownloads,
      publishedAt: meta.publishedAt,
      maintainerCount: meta.maintainerCount,
      hasTypes: meta.hasTypes,
      licenseType: meta.license,
      hasInstallScript: meta.hasInstallScript,
      dependencyCount: meta.dependencyCount,
      signalFlags: signals.flags.map((flag) => flag.message),
      signalScore: signals.riskScore,
      dependencyFlags
    });
  } catch (err) {
    return stageError("analyze", `Deep Heurist analysis failed. ${err instanceof Error ? err.message : ""}`.trim(), 500);
  }

  const riskScore = heuristReport.heuristCalled
    ? Math.max(signals.riskScore, Math.min(heuristReport.riskScore, signals.riskScore + 25))
    : signals.riskScore;
  const riskLevel = scoreToSeverity(riskScore);
  const riskSignals: RiskSignal[] = signals.flags.map((flag) => ({
    type: flag.code === "TYPOSQUAT_RISK" ? "typosquat" : flag.code.includes("INSTALL_SCRIPT") ? "install_script" : "metadata_signal",
    severity: flag.severity === "info" ? "low" : severityToRiskLevel(flag.severity),
    evidence: flag.message,
    recommendation: recommendationForFlag(flag.code)
  }));

  const report = {
    packageName: meta.name,
    version: meta.version,
    riskScore,
    riskLevel,
    summary: heuristReport.summary,
    signals: riskSignals,
    finalRecommendation:
      riskScore > 60 ? "avoid_until_manual_review" : riskScore >= 30 ? "use_with_caution" : "safe_to_review",
    confidence: heuristReport.heuristCalled ? 0.82 : 0.58,
    heuristCalled: heuristReport.heuristCalled,
    limitations: heuristReport.heuristCalled ? [] : ["Heurist unavailable; deterministic fallback report returned."],
    methodology: "Deep Scan: npm metadata, dependency risk helper, three Heurist passes, and critic validation",
    metadata: {
      repository: meta.repository,
      license: meta.license,
      dependencyCount: meta.dependencyCount,
      dependencyRisk,
      hasInstallScripts: meta.hasInstallScript,
      publishedAt: meta.publishedAt,
      maintainerCount: meta.maintainerCount,
      weeklyDownloads: meta.weeklyDownloads,
      heuristDetails: heuristReport.details,
      flags: heuristReport.flags
    }
  };

  const scanId =
    body.onchainScanId && ethers.isHexString(body.onchainScanId)
      ? body.onchainScanId
      : ethers.keccak256(ethers.toUtf8Bytes(`${address}:${meta.name}:${meta.version}:deep:${Date.now()}`));
  const reportHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ meta, signals, dependencyRisk, report })));

  let scanRecord: { id: string } | null = null;
  try {
    scanRecord = await prisma.instantScan.create({
      data: {
        userAddress: address,
        address,
        packageName: meta.name,
        version: meta.version,
        packageVersion: meta.version,
        scanDepth: "deep",
        paid: true,
        isPaid: true,
        amountPaid: "3",
        paymentTx: body.paymentTxHash,
        scanId,
        proofHash: reportHash,
        reportHash,
        reportJson: toJsonValue({ meta, signals, dependencyRisk, report }),
        proofAnchored: false,
        severity: riskLevel,
        riskScore,
        riskLevel
      },
      select: { id: true }
    });
  } catch (err) {
    console.error("[Deep Scan][Save] DB save failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    success: true,
    stage: "complete",
    data: {
      packageMeta: meta,
      dependencyRisk,
      signals,
      report,
      scanId: scanRecord?.id ?? null,
      onchainScanId: scanId,
      reportHash,
      proofAnchored: false
    }
  });
}

function severityToRiskLevel(severity: "critical" | "high" | "medium" | "low" | "info"): Severity {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function scoreToSeverity(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "clean";
}

function recommendationForFlag(code: string) {
  if (code === "KNOWN_INCIDENT") return "Review affected versions and pin or migrate according to the incident recommendation.";
  if (code === "TYPOSQUAT_RISK") return "Verify package identity before install and compare against the known package.";
  if (code === "MALICIOUS_INSTALL_SCRIPT") return "Do not install until the lifecycle script is manually reviewed and verified benign.";
  if (code === "HAS_INSTALL_SCRIPT") return "Review lifecycle scripts manually before installing this package in sensitive environments.";
  if (code === "NO_REPOSITORY") return "Treat source provenance as weak until repository ownership is verified.";
  if (code === "NO_LICENSE") return "Confirm legal usage terms before adopting this dependency.";
  return "Review this metadata signal before using the package in production.";
}
