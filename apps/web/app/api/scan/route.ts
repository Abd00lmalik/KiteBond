import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { analyzePackageWithHeurist } from "@/lib/heurist";
import type { RiskSignal, Severity } from "@/lib/heuristics";
import { toJsonValue } from "@/lib/json";
import { fetchNpmMeta } from "@/lib/npm";
import { extractSignals } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

type ScanStage = "auth" | "resolve" | "analyze" | "save";

function stageError(stage: ScanStage, error: string, status = 500) {
  return NextResponse.json({ success: false, stage, error }, { status });
}

export async function POST(req: NextRequest) {
  let body: { package?: string; packageName?: string; address?: string; walletAddress?: string; version?: string };
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

  try {
    await prisma.userUsage.upsert({
      where: { walletAddress: address },
      update: {
        freeScansUsed: { increment: 1 },
        scanCount: { increment: 1 },
        totalScans: { increment: 1 },
        lastScanAt: new Date()
      },
      create: {
        walletAddress: address,
        address,
        freeScansUsed: 1,
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

  const signals = extractSignals(meta, packageName);

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
      signalFlags: signals.flags.map((flag) => flag.message),
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

  const riskScore = Math.max(signals.riskScore, heuristReport.riskScore);
  const riskLevel = scoreToSeverity(riskScore);
  const riskSignals: RiskSignal[] = signals.flags.map((flag) => ({
    type: flag.code === "TYPOSQUAT_RISK" ? "typosquat" : flag.code === "INSTALL_SCRIPT" ? "install_script" : "metadata_signal",
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
    confidence: heuristReport.heuristCalled ? 0.74 : 0.54,
    limitations: heuristReport.heuristCalled ? [] : ["Heurist unavailable; deterministic fallback report returned."],
    methodology: heuristReport.heuristCalled
      ? "npm registry metadata, deterministic signal extraction, and Heurist chat-completions analysis"
      : "npm registry metadata and deterministic signal extraction fallback",
    metadata: {
      repository: meta.repository,
      license: meta.license,
      dependencyCount: meta.dependencyCount,
      hasInstallScripts: meta.hasInstallScript,
      publishedAt: meta.publishedAt,
      maintainerCount: meta.maintainerCount,
      weeklyDownloads: meta.weeklyDownloads,
      heuristCalled: heuristReport.heuristCalled,
      details: heuristReport.details,
      flags: heuristReport.flags
    }
  };

  const scanId = ethers.keccak256(ethers.toUtf8Bytes(`${address}:${meta.name}:${meta.version}:${Date.now()}`));
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
        scanDepth: "quick",
        paid: false,
        isPaid: false,
        amountPaid: "0",
        scanId,
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
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function recommendationForFlag(code: string) {
  if (code === "TYPOSQUAT_RISK") return "Verify package identity before install and compare against the known package.";
  if (code === "INSTALL_SCRIPT") return "Review lifecycle scripts manually before installing this package.";
  if (code === "NO_REPOSITORY") return "Treat source provenance as weak until repository ownership is verified.";
  if (code === "NO_LICENSE") return "Confirm legal usage terms before adopting this dependency.";
  return "Review this metadata signal before using the package in production.";
}
