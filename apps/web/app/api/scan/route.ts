import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { analyzePackageWithHeurist } from "@/lib/heurist";
import type { RiskSignal, Severity } from "@/lib/heuristics";
import { toJsonValue } from "@/lib/json";
import { fetchNpmMeta, type NpmPackageMeta } from "@/lib/npm";
import { verifyKitePaymentTx } from "@/lib/paymentVerification";
import { extractSignals } from "@/lib/signals";
import { matchKnownIncidents } from "@/lib/knownIncidents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // seconds

const SCAN_DEADLINE_MS = 25_000;

function timeLeft(start: number): number {
  return SCAN_DEADLINE_MS - (Date.now() - start);
}

function isOverBudget(start: number): boolean {
  return timeLeft(start) < 2000;
}

type ScanStage = "auth" | "resolve" | "analyze" | "save";
type TarballInspection = {
  fileCount: number;
  fileList: string[];
  hasBinaryFiles: boolean;
  hasObfuscatedJs: boolean;
  hasHiddenFiles: boolean;
  suspiciousExtensions: string[];
  suspiciousFileNames: string[];
  suspiciousTextFindings: string[];
  inspectedTextFiles: number;
  totalSizeKb: number;
  inspectionNote?: string;
};
const REPORT_LIMITATIONS = [
  "Audit boundary: static pre-install investigation only.",
  "Safe scope: package code is never executed in KiteBond analysis.",
  "Coverage: registry metadata, lifecycle scripts, dependency surface, and tarball structure/text checks.",
  "Dependency depth: direct dependencies are analyzed in Instant Scan.",
  "Evidence sources: public npm registry signals and documented incident intelligence.",
  "AI reasoning is constrained to supplied evidence and cross-validated with deterministic rules."
];

function stageError(stage: ScanStage, error: string, status = 500) {
  return NextResponse.json({ success: false, stage, error }, { status });
}

export async function POST(req: NextRequest) {
  const scanStart = Date.now();
  try {
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

  const rawPackageInput = (body.package ?? body.packageName ?? "").trim();
  const parsedPackage = parsePackageInput(rawPackageInput);
  if (!parsedPackage.ok) return apiError(parsedPackage.error, 400);
  const packageName = parsedPackage.name.toLowerCase();
  const requestedVersion = body.version?.trim() || parsedPackage.version || "latest";

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
  let requiredPayment = 1;

  try {
    const usage = await prisma.userUsage.findUnique({ where: { walletAddress: address } });
    isFreeInstantScan = !usage || usage.freeScansUsed === 0;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[Scan][Auth] userUsage lookup failed (non-fatal):", detail);
  }
  requiredPayment = isFreeInstantScan ? 0 : 1;

  if (requiredPayment > 0 && !body.paymentTxHash) {
    return stageError(
      "auth",
      "Payment required. Approve 1 USDT before running your next scan.",
      402
    );
  }
  if (requiredPayment > 0 && body.paymentTxHash) {
    try {
      const paymentConfirmed = await verifyKitePaymentTx(body.paymentTxHash, address);
      if (!paymentConfirmed) return stageError("auth", "Payment transaction is not a confirmed 1 USDT scan fee.", 402);
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

  let meta: NpmPackageMeta | null = null;
  const tRegistry = Date.now();
  try {
    meta = await fetchNpmMeta(packageName, requestedVersion);
  } catch (err) {
    console.warn("[Scan][registry] failed:", err instanceof Error ? err.message : err);
  }
  console.log(`[Scan][registry-fetch] ${Date.now() - tRegistry}ms`);

  if (!meta) {
    return NextResponse.json({
      success: false,
      stage: "resolve",
      error: "Failed to resolve package from npm registry."
    }, { status: 400 });
  }

  let tarballInfo: TarballInspection | null = null;
  if (!isOverBudget(scanStart)) {
    const tTarball = Date.now();
    try {
      // Runtime-only import keeps build tracing resilient on Vercel.
      const { inspectTarball } = await import("@/lib/tarball");
      tarballInfo = await inspectTarball(meta.name, meta.version);
    } catch (err) {
      console.warn("[Scan][tarball] failed (non-fatal):", err instanceof Error ? err.message : err);
    }
    console.log(`[Scan][tarball-inspect] ${Date.now() - tTarball}ms`);
  } else {
    console.warn("[Scan][tarball] skipped, over budget.");
  }

  const signals = extractSignals(meta, packageName, tarballInfo);
  const evidenceBreakdown = signals.flags.reduce(
    (acc, flag) => {
      acc[flag.evidenceGrade] += 1;
      return acc;
    },
    { confirmed: 0, suspicious: 0, heuristic: 0, missing_data: 0, historical: 0 }
  );
  const tarballSection = tarballInfo
    ? [
        "Tarball inspection (static only):",
        `- File count: ${tarballInfo.fileCount}`,
        `- Text files inspected: ${tarballInfo.inspectedTextFiles}`,
        `- Has binary files: ${tarballInfo.hasBinaryFiles}`,
        `- Has hidden files: ${tarballInfo.hasHiddenFiles}`,
        `- Suspicious file names: ${tarballInfo.suspiciousFileNames.join(", ") || "none"}`,
        `- Suspicious text findings: ${tarballInfo.suspiciousTextFindings.join(" | ") || "none"}`,
        `- Suspicious script files at root: ${tarballInfo.suspiciousExtensions.join(", ") || "none"}`,
        `- Total size: ${tarballInfo.totalSizeKb}KB`,
        tarballInfo.inspectionNote ? `- Note: ${tarballInfo.inspectionNote}` : ""
      ].join("\n")
    : "Tarball inspection unavailable (network/size boundary).";
  const tarballEvidence = tarballInfo
    ? [
        `file_count:${tarballInfo.fileCount}`,
        `inspected_text_files:${tarballInfo.inspectedTextFiles}`,
        `has_binary_files:${tarballInfo.hasBinaryFiles}`,
        `has_hidden_files:${tarballInfo.hasHiddenFiles}`,
        `has_obfuscated_js:${tarballInfo.hasObfuscatedJs}`,
        `suspicious_extensions:${tarballInfo.suspiciousExtensions.join(",") || "none"}`,
        `suspicious_file_names:${tarballInfo.suspiciousFileNames.join(",") || "none"}`,
        `suspicious_text_findings:${tarballInfo.suspiciousTextFindings.join(" | ") || "none"}`,
        `total_size_kb:${tarballInfo.totalSizeKb}`,
        tarballInfo.inspectionNote ? `note:${tarballInfo.inspectionNote}` : ""
      ].filter(Boolean)
    : ["tarball_inventory:unavailable"];
  const incidentContext = matchKnownIncidents(meta.name, meta.version).map((entry) => {
    const affected = entry.status === "active" ? "active_version_match" : "historical_context";
    const versionSpec = entry.incident.affectedVersions.range
      ? `range ${entry.incident.affectedVersions.range}`
      : `versions ${(entry.incident.affectedVersions.versions ?? []).join(", ")}`;
    return `${entry.incident.incidentType} (${affected}) - ${versionSpec}. Source: ${entry.incident.source}`;
  });

  let heuristReport;
  const tHeurist = Date.now();
  if (timeLeft(scanStart) >= 13_000) {
    try {
      heuristReport = await analyzePackageWithHeurist(packageName, {
        version: meta.version,
        description: meta.description,
        author: meta.author,
        repository: meta.repository,
        homepage: meta.homepage,
        keywords: meta.keywords,
        weeklyDownloads: meta.weeklyDownloads,
        firstPublishedAt: meta.firstPublishedAt,
        publishedAt: meta.publishedAt,
        totalVersions: meta.totalVersions,
        maintainerCount: meta.maintainerCount,
        maintainers: meta.maintainers.map((maintainer) => maintainer.name),
        hasTypes: meta.hasTypes,
        licenseType: meta.license,
        hasInstallScript: meta.hasInstallScript,
        scripts: meta.scripts,
        dependencyCount: meta.dependencyCount,
        dependencyNames: meta.dependencyNames,
        signalFlags: [...signals.flags.map((flag) => flag.message), tarballSection],
        signalScore: signals.riskScore,
        evidenceBreakdown,
        knownIncidentContext: incidentContext,
        tarballEvidence,
        auditScope: REPORT_LIMITATIONS
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      console.warn("[Scan][heurist] failed, using deterministic fallback:", reason);
    }
  } else {
    console.warn("[Scan][heurist] skipped, over budget.");
  }
  console.log(`[Scan][heurist-call] ${Date.now() - tHeurist}ms`);

  if (!heuristReport) {
    const { buildFallbackAnalysis } = await import("@/lib/heurist");
    const fallback = buildFallbackAnalysis(
      meta,
      signals.flags.map(f => ({
        type: "metadata_signal",
        severity: f.severity === "info" ? "low" : severityToRiskLevel(f.severity),
        evidence: f.message,
        recommendation: recommendationForFlag(f.code),
        evidenceGrade: f.evidenceGrade
      })),
      "Heurist AI analysis timed out or failed. Used deterministic fallback."
    );
    heuristReport = {
      riskScore: fallback.riskScore,
      summary: fallback.summary,
      findings: [],
      details: [],
      flags: [],
      recommendation: "caution" as const,
      heuristCalled: false,
      unsupportedClaims: 0,
      meshEvidenceUsed: false
    };
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
    findings: heuristReport.findings,
    signals: riskSignals,
    finalRecommendation:
      riskScore > 60 ? "avoid_until_manual_review" : riskScore >= 30 ? "use_with_caution" : "safe_to_review",
    confidence: heuristReport.heuristCalled ? Math.max(0.56, 0.78 - heuristReport.unsupportedClaims * 0.04) : 0.54,
    heuristCalled: heuristReport.heuristCalled,
    limitations: REPORT_LIMITATIONS,
    methodology: heuristReport.heuristCalled
      ? "npm registry metadata, safe tarball filename inspection, deterministic signals, and Heurist chat-completions analysis"
      : "npm registry metadata, safe tarball filename inspection, and deterministic risk signals",
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
      flags: heuristReport.flags,
      recommendation: heuristReport.recommendation,
      unsupportedClaims: heuristReport.unsupportedClaims,
      meshEvidenceUsed: heuristReport.meshEvidenceUsed
    }
  };

  const scanId =
    body.onchainScanId && ethers.isHexString(body.onchainScanId)
      ? body.onchainScanId
      : ethers.keccak256(ethers.toUtf8Bytes(`${address}:${meta.name}:${meta.version}:${Date.now()}`));
  const proofHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ meta, signals, report })));
  let scanRecord: { id: string } | null = null;
  let saveError: string | null = null;

  const tDb = Date.now();
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
    console.error("[Scan][db-save] failed (non-fatal):", saveError);
  }
  console.log(`[Scan][db-save] ${Date.now() - tDb}ms`);

  console.log(`[Scan][total] ${Date.now() - scanStart}ms`);
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
  } catch (err) {
    console.error("[Scan][fatal]", err);
    return NextResponse.json(
      {
        error: "scan_failed",
        message: "Scan could not be completed. Please try again.",
        details: process.env.NODE_ENV === "development"
          ? (err instanceof Error ? err.message : String(err))
          : undefined
      },
      { status: 500 }
    );
  }
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
  if (code.startsWith("KNOWN_INCIDENT")) return "Review the documented incident record, pin safe versions, and verify lockfile integrity.";
  if (code === "TYPOSQUAT_RISK") return "Verify package identity before install and compare against the known package.";
  if (code === "MALICIOUS_INSTALL_SCRIPT") return "Do not install until the lifecycle script is manually reviewed and verified benign.";
  if (code === "HAS_INSTALL_SCRIPT") return "Review lifecycle scripts manually before installing this package in sensitive environments.";
  if (code === "SUSPICIOUS_DEPENDENCY_NAMES") return "Inspect dependency provenance and lock exact versions before adoption.";
  if (code === "REPOSITORY_MISMATCH") return "Verify that npm publisher and repository ownership are controlled by the same trusted maintainer.";
  if (code === "NO_ACTIVE_MAINTENANCE") return "Consider maintained alternatives or apply stricter pinning and internal review.";
  if (code === "BINARY_FILES_IN_PACKAGE") return "Audit binary artifacts and verify integrity before adopting this dependency.";
  if (code === "SCRIPT_FILES_IN_PACKAGE") return "Review root-level script files and remove from trusted environments if unnecessary.";
  if (code === "NO_REPOSITORY") return "Treat source provenance as weak until repository ownership is verified.";
  if (code === "NO_LICENSE") return "Confirm legal usage terms before adopting this dependency.";
  return "Review this metadata signal before using the package in production.";
}

function parsePackageInput(value: string): { ok: true; name: string; version?: string } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "Package name is required." };
  if (trimmed.length > 214) return { ok: false, error: "Package name too long." };

  let name = trimmed;
  let version: string | undefined;

  if (trimmed.startsWith("@")) {
    const slash = trimmed.indexOf("/");
    if (slash <= 1) return { ok: false, error: "Invalid scoped package name." };
    const secondAt = trimmed.indexOf("@", slash + 1);
    if (secondAt > slash + 1) {
      name = trimmed.slice(0, secondAt);
      version = trimmed.slice(secondAt + 1) || undefined;
    }
  } else {
    const at = trimmed.lastIndexOf("@");
    if (at > 0) {
      name = trimmed.slice(0, at);
      version = trimmed.slice(at + 1) || undefined;
    }
  }

  const normalizedName = name.toLowerCase();
  if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(normalizedName)) {
    return { ok: false, error: "Invalid package name." };
  }

  return { ok: true, name: normalizedName, version };
}
