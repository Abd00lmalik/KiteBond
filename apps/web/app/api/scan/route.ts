import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { analyzePackageWithHeurist } from "@/lib/heurist";
import type { RiskSignal, Severity } from "@/lib/heuristics";
import { toJsonValue } from "@/lib/json";
import { fetchNpmMeta } from "@/lib/npm";
import { verifyKitePaymentTx } from "@/lib/paymentVerification";
import { extractSignals } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

type ScanStage = "auth" | "resolve" | "analyze" | "save";
type TarballInspection = {
  fileCount: number;
  fileList: string[];
  hasBinaryFiles: boolean;
  hasObfuscatedJs: boolean;
  hasHiddenFiles: boolean;
  suspiciousExtensions: string[];
  totalSizeKb: number;
  inspectionNote?: string;
};
const REPORT_LIMITATIONS = [
  "Analysis is static and metadata-based. No package code is executed.",
  "Tarball inspection covers file names and sizes only, not file content.",
  "Dependency tree coverage is currently direct dependencies only.",
  "Risk score reflects available public signals and may miss private-registry behavior.",
  "Historical incident coverage is limited to documented known cases in the local incident database.",
  "Heurist AI analysis is probabilistic and should be validated before production deployment."
];

function stageError(stage: ScanStage, error: string, status = 500) {
  return NextResponse.json({ success: false, stage, error }, { status });
}

export async function POST(req: NextRequest) {
  let body: {
    package?: string;
    packageName?: string;
    address?: string;
    walletAddress?: string;
    version?: string;
    scanType?: string;
    scanDepth?: string;
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
  if (rawPackageName.length > 214) return apiError("Package name too long.", 400);
  if (/[\/\\<>]/.test(rawPackageName)) return apiError("Invalid package name characters.", 400);

  const packageName = rawPackageName.split("@")[0] || rawPackageName;
  if (!packageName) return apiError("Package name is required.", 400);

  const address = (body.address ?? body.walletAddress ?? "").trim().toLowerCase() || "anonymous";
  const rawScanType = (body.scanType ?? body.scanDepth ?? "instant").trim().toLowerCase();
  if (rawScanType === "deep") {
    return stageError("auth", "Deep Scan is not yet available. Use Instant Scan for full analysis.", 400);
  }
  if (!["instant", "quick", "standard"].includes(rawScanType)) {
    return stageError("auth", "Invalid scan type. Use Instant Scan.", 400);
  }
  const effectiveScanType = "instant";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("[Scan] DB ping failed:", err);
    return NextResponse.json(
      {
        success: false,
        stage: "auth",
        error: "Database is not reachable. Check Vercel DATABASE_URL and Neon connection."
      },
      { status: 503 }
    );
  }

  let isFreeInstantScan = true;
  let requiredPayment = 1_000_000;

  try {
    const usage = await prisma.userUsage.findUnique({ where: { walletAddress: address } });
    isFreeInstantScan = !usage || usage.freeScansUsed === 0;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[Scan][Auth] userUsage lookup failed (non-fatal):", detail);
  }
  requiredPayment = isFreeInstantScan ? 0 : 1_000_000;

  if (requiredPayment > 0 && !body.paymentTxHash) {
    return stageError(
      "auth",
      "Payment required. Approve 1 USDT before running your next scan.",
      402
    );
  }
  if (requiredPayment > 0 && body.paymentTxHash) {
    try {
      const paymentConfirmed = await verifyKitePaymentTx(body.paymentTxHash);
      if (!paymentConfirmed) return stageError("auth", "Payment transaction is not confirmed on KiteAI.", 402);
    } catch (err) {
      console.error("[Scan][Auth] Payment verification failed:", err instanceof Error ? err.message : err);
      return stageError("auth", "Could not verify scan payment on KiteAI.", 502);
    }
  }

  try {
    await prisma.userUsage.upsert({
      where: { walletAddress: address },
      update: {
        freeScansUsed: isFreeInstantScan ? { increment: 1 } : undefined,
        scanCount: { increment: 1 },
        totalScans: { increment: 1 },
        lastScanAt: new Date()
      },
      create: {
        walletAddress: address,
        address,
        freeScansUsed: isFreeInstantScan ? 1 : 0,
        scanCount: 1,
        totalScans: 1,
        lastScanAt: new Date()
      }
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[Scan][Auth] userUsage upsert failed (non-fatal):", detail);
  }

  let meta;
  try {
    meta = await fetchNpmMeta(packageName, body.version ?? "latest");
  } catch (err) {
    return stageError(
      "resolve",
      err instanceof Error ? err.message : "Failed to resolve package from npm registry.",
      400
    );
  }

  let tarballInfo: TarballInspection | null = null;
  try {
    // Runtime-only import keeps build tracing resilient on Vercel.
    const { inspectTarball } = await import("@/lib/tarball");
    tarballInfo = await inspectTarball(meta.name, meta.version);
  } catch (err) {
    console.warn("[Scan] Tarball inspection failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  const signals = extractSignals(meta, packageName, tarballInfo);
  const tarballSection = tarballInfo
    ? [
        "Tarball inspection (file names/sizes only):",
        `- File count: ${tarballInfo.fileCount}`,
        `- Has binary files: ${tarballInfo.hasBinaryFiles}`,
        `- Has hidden files: ${tarballInfo.hasHiddenFiles}`,
        `- Suspicious script files at root: ${tarballInfo.suspiciousExtensions.join(", ") || "none"}`,
        `- Total size: ${tarballInfo.totalSizeKb}KB`
      ].join("\n")
    : "Tarball inspection unavailable (size limit or fetch failure).";

  let heuristReport;
  try {
    heuristReport = await analyzePackageWithHeurist(packageName, {
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
      signalFlags: [...signals.flags.map((flag) => flag.message), tarballSection],
      signalScore: signals.riskScore
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        stage: "analyze",
        error: `Heurist analysis failed. ${err instanceof Error ? err.message : ""}`.trim()
      },
      { status: 500 }
    );
  }

  const riskScore = heuristReport.heuristCalled
    ? Math.max(signals.riskScore, Math.min(heuristReport.riskScore, signals.riskScore + 20))
    : signals.riskScore;
  const riskLevel = scoreToSeverity(riskScore);
  const riskSignals: RiskSignal[] = signals.flags.map((flag) => ({
    type:
      flag.code === "TYPOSQUAT_RISK"
        ? "typosquat"
        : flag.code.includes("INSTALL_SCRIPT")
          ? "install_script"
          : flag.code.includes("DEPENDENCY")
            ? "dependency_risk"
            : flag.code.includes("BINARY") || flag.code.includes("SCRIPT_FILES")
              ? "tarball_signal"
              : "metadata_signal",
    severity: flag.severity === "info" ? "low" : severityToRiskLevel(flag.severity),
    evidence: flag.message,
    recommendation: recommendationForFlag(flag.code),
    evidenceGrade: flag.evidenceGrade
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
    confidence: heuristReport.heuristCalled ? 0.74 : 0.54,
    heuristCalled: heuristReport.heuristCalled,
    limitations: heuristReport.heuristCalled ? REPORT_LIMITATIONS : [...REPORT_LIMITATIONS, "Heurist unavailable; deterministic fallback report returned."],
    methodology: heuristReport.heuristCalled
      ? "npm registry metadata, safe tarball filename inspection, deterministic signals, and Heurist chat-completions analysis"
      : "npm registry metadata, safe tarball filename inspection, and deterministic signal fallback",
    metadata: {
      repository: meta.repository,
      license: meta.license,
      dependencyCount: meta.dependencyCount,
      hasInstallScripts: meta.hasInstallScript,
      peerDependencyCount: meta.peerDependencyCount,
      tarballInspection: tarballInfo,
      publishedAt: meta.publishedAt,
      maintainerCount: meta.maintainerCount,
      weeklyDownloads: meta.weeklyDownloads,
      heuristCalled: heuristReport.heuristCalled,
      details: heuristReport.details,
      flags: heuristReport.flags
    }
  };

  const scanId =
    body.onchainScanId && ethers.isHexString(body.onchainScanId)
      ? body.onchainScanId
      : ethers.keccak256(ethers.toUtf8Bytes(`${address}:${meta.name}:${meta.version}:${Date.now()}`));
  const proofHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ meta, signals, report })));
  let scanRecord: { id: string } | null = null;
  let saveError: string | null = null;

  try {
    scanRecord = await prisma.instantScan.create({
      data: {
        userAddress: address,
        address,
        packageName: meta.name,
        version: meta.version,
        packageVersion: meta.version,
        scanDepth: effectiveScanType,
        paid: requiredPayment > 0,
        isPaid: requiredPayment > 0,
        amountPaid: requiredPayment > 0 ? "1" : "0",
        paymentTx: body.paymentTxHash ?? null,
        scanId: scanId as string,
        proofHash,
        reportHash: proofHash,
        reportJson: toJsonValue({ meta, signals, report }),
        proofAnchored: false,
        severity: riskLevel,
        riskScore,
        riskLevel
      },
      select: { id: true }
    });
  } catch (err) {
    saveError = err instanceof Error ? err.message : String(err);
    console.error("[Scan] DB save failed (non-fatal):", saveError);
  }

  return NextResponse.json({
    success: true,
    stage: "complete",
    data: {
      packageMeta: meta,
      signals,
      report,
      scanId: scanRecord?.id ?? null,
      onchainScanId: scanId,
      reportHash: proofHash,
      proofAnchored: false,
      saveError: process.env.NODE_ENV === "development" ? saveError : saveError ? "Scan result was not saved, but analysis completed." : null
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
  if (code === "KNOWN_INCIDENT") return "Review the documented incident, pin to safe versions, and consider migration.";
  if (code === "TYPOSQUAT_RISK") return "Verify package identity before install and compare against the known package.";
  if (code === "MALICIOUS_INSTALL_SCRIPT") return "Do not install until the lifecycle script is manually reviewed and verified benign.";
  if (code === "HAS_INSTALL_SCRIPT") return "Review lifecycle scripts manually before installing this package in sensitive environments.";
  if (code === "BINARY_FILES_IN_PACKAGE") return "Audit binary artifacts and verify integrity before adopting this dependency.";
  if (code === "SCRIPT_FILES_IN_PACKAGE") return "Review root-level script files and remove from trusted environments if unnecessary.";
  if (code === "NO_REPOSITORY") return "Treat source provenance as weak until repository ownership is verified.";
  if (code === "NO_LICENSE") return "Confirm legal usage terms before adopting this dependency.";
  return "Review this metadata signal before using the package in production.";
}
