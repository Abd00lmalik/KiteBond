import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { apiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { toJsonValue } from "@/lib/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvidenceInput = {
  type?: string;
  description?: string;
  source?: string;
  location?: string;
};

type SubmissionBody = {
  huntId?: string;
  packageName?: string;
  version?: string;
  severity?: string;
  summary?: string;
  evidence?: EvidenceInput[];
  confidence?: string;
  agentAddress?: string;
  stakeTxHash?: string;
  submitTxHash?: string;
};

const severityMap: Record<string, "low" | "medium" | "high" | "critical"> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical"
};

const confidenceMap: Record<string, number> = {
  LOW: 0.45,
  MEDIUM: 0.68,
  HIGH: 0.86
};

const signalTypeMap: Record<string, string> = {
  known_incident: "metadata_signal",
  script_risk: "install_script",
  metadata_risk: "metadata_signal",
  dependency_risk: "dependency_risk",
  file_risk: "tarball_signal"
};

function riskScoreFor(severity: "low" | "medium" | "high" | "critical") {
  if (severity === "critical") return 88;
  if (severity === "high") return 68;
  if (severity === "medium") return 42;
  return 18;
}

function recommendationFor(severity: "low" | "medium" | "high" | "critical") {
  if (severity === "critical" || severity === "high") return "avoid_until_manual_review";
  if (severity === "medium") return "use_with_caution";
  return "safe_to_review";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as SubmissionBody;
    console.log("[Submit]", params.id, body.agentAddress, body.severity);
    const severity = severityMap[(body.severity || "").toUpperCase()];
    const confidence = confidenceMap[(body.confidence || "").toUpperCase()] ?? 0.68;

    if (!body.agentAddress || !ethers.isAddress(body.agentAddress)) {
      return NextResponse.json({ error: "Valid agentAddress required", code: "SUBMISSION_AGENT_REQUIRED" }, { status: 400 });
    }
    if (!body.packageName || !body.version || !body.summary || !severity || !Array.isArray(body.evidence)) {
      return NextResponse.json(
        { error: "packageName, version, severity, summary and evidence[] required", code: "SUBMISSION_INPUT_REQUIRED" },
        { status: 400 }
      );
    }

    const numericId = Number(params.id);
    const hunt = await prisma.hunt.findFirst({
      where: Number.isFinite(numericId)
        ? { OR: [{ id: params.id }, { chainHuntId: numericId }, { onChainId: numericId }] }
        : { id: params.id }
    });
    if (!hunt) return NextResponse.json({ error: "Hunt not found", code: "HUNT_NOT_FOUND" }, { status: 404 });
    if (hunt.status.toLowerCase() !== "open") {
      return NextResponse.json({ error: "Hunt is not open", code: "HUNT_NOT_OPEN" }, { status: 409 });
    }
    if (body.packageName.toLowerCase() !== hunt.packageName.toLowerCase() || body.version !== hunt.version) {
      return NextResponse.json({ error: "Submission package/version does not match hunt", code: "HUNT_PACKAGE_MISMATCH" }, { status: 400 });
    }

    const signals = body.evidence.map((item) => ({
      type: signalTypeMap[item.type || ""] || "metadata_signal",
      severity,
      source: item.source,
      location: item.location,
      evidence: [item.description, item.source ? `Source: ${item.source}` : null, item.location ? `Location: ${item.location}` : null]
        .filter(Boolean)
        .join(" "),
      recommendation: "Review the cited evidence and verify package provenance before production adoption."
    }));

    const reportJson = {
      huntId: hunt.id,
      agentAddress: body.agentAddress,
      packageName: hunt.packageName,
      version: hunt.version,
      riskScore: riskScoreFor(severity),
      riskLevel: severity,
      summary: body.summary,
      signals,
      finalRecommendation: recommendationFor(severity),
      confidence,
      limitations: ["Submitted through the public findings API; package code execution is not performed."],
      metadata: {
        repository: null,
        license: null,
        dependencyCount: 0,
        hasInstallScripts: signals.some((signal) => signal.type === "install_script")
      }
    };
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(reportJson)));

    const submission = await prisma.submission.create({
      data: {
        huntId: hunt.id,
        agentAddress: body.agentAddress,
        stakeTx: body.stakeTxHash,
        reportHash,
        proofHash: reportHash,
        reportJson: toJsonValue(reportJson),
        status: "Submitted",
        settlementTx: body.submitTxHash,
        txHash: body.submitTxHash
      }
    });

    await prisma.agentProfile.upsert({
      where: { address: body.agentAddress },
      update: { totalSubmitted: { increment: 1 } },
      create: { address: body.agentAddress, totalSubmitted: 1 }
    });

    return NextResponse.json(
      {
        submissionId: submission.id,
        status: "PENDING",
        data: submission
      },
      { status: 201 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to submit finding";
    console.error("[Submit] Error:", error);
    return apiError("Submission failed. Please try again.", 500, detail);
  }
}
