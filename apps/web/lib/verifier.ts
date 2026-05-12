import { ethers } from "ethers";

const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_SIGNAL_TYPES = [
  "install_script",
  "dependency_risk",
  "typosquat",
  "maintainer_signal",
  "metadata_signal",
  "version_signal",
  "repository_signal",
  "tarball_signal"
];
const VALID_RECOMMENDATIONS = ["safe_to_review", "use_with_caution", "avoid_until_manual_review"];
const VALID_RISK_LEVELS = ["low", "medium", "high", "critical"];

export interface VerifierOutput {
  passed: boolean;
  score: number;
  reasons: string[];
  missingFields: string[];
  evidenceQuality: "weak" | "acceptable" | "strong";
  decision: "valid" | "invalid" | "needs_manual_review";
  slashRecommended: boolean;
}

export interface VerifierResult extends VerifierOutput {
  valid: boolean;
  failReason?: string;
  checks: { name: string; passed: boolean; detail?: string }[];
  verificationHash: string;
}

export function verifyReport(
  reportJson: unknown,
  expectedPackageName: string,
  expectedVersion: string,
  submittedReportHash: string,
  deadline: Date
): VerifierResult {
  const checks: { name: string; passed: boolean; detail?: string }[] = [];
  const missingFields: string[] = [];
  const check = (name: string, condition: boolean, detail?: string) => checks.push({ name, passed: condition, detail });

  check("validJson", typeof reportJson === "object" && reportJson !== null);
  if (!checks[0].passed) {
    return finalize({
      checks,
      missingFields,
      reason: "Report is not a valid JSON object",
      slashRecommended: true
    });
  }

  const report = reportJson as Record<string, unknown>;
  const requiredFields = [
    "packageName",
    "version",
    "riskScore",
    "riskLevel",
    "summary",
    "signals",
    "finalRecommendation",
    "confidence",
    "limitations",
    "metadata"
  ];
  for (const field of requiredFields) {
    if (!(field in report)) missingFields.push(field);
  }
  check("requiredFields", missingFields.length === 0, missingFields.length ? `Missing: ${missingFields.join(", ")}` : "All required fields present");

  check(
    "packageNameMatch",
    typeof report.packageName === "string" && report.packageName.toLowerCase() === expectedPackageName.toLowerCase(),
    `Expected ${expectedPackageName}, got ${String(report.packageName)}`
  );
  check("versionPresent", typeof report.version === "string" && report.version.length > 0);
  check(
    "versionMatch",
    expectedVersion === "latest" || (typeof report.version === "string" && report.version === expectedVersion),
    `Expected ${expectedVersion}, got ${String(report.version)}`
  );
  check("riskScoreValid", Number.isInteger(report.riskScore) && Number(report.riskScore) >= 0 && Number(report.riskScore) <= 100);
  check("riskLevelValid", typeof report.riskLevel === "string" && VALID_RISK_LEVELS.includes(report.riskLevel));
  check("summaryPresent", typeof report.summary === "string" && report.summary.length > 0);
  check(
    "summaryReferencesPackage",
    typeof report.summary === "string" && report.summary.toLowerCase().includes(expectedPackageName.toLowerCase()),
    typeof report.summary === "string" && report.summary.toLowerCase().includes(expectedPackageName.toLowerCase())
      ? "Summary references package name."
      : "Summary does not mention the package name. Likely generic."
  );
  check("signalsIsArray", Array.isArray(report.signals));

  let evidenceQuality: VerifierOutput["evidenceQuality"] = "acceptable";
  if (Array.isArray(report.signals)) {
    const signalsValid = report.signals.every((signal) => {
      if (typeof signal !== "object" || signal === null) return false;
      const sig = signal as Record<string, unknown>;
      return (
        typeof sig.type === "string" &&
        VALID_SIGNAL_TYPES.includes(sig.type) &&
        typeof sig.severity === "string" &&
        VALID_SEVERITIES.includes(sig.severity) &&
        typeof sig.evidence === "string" &&
        sig.evidence.length >= 15 &&
        typeof sig.recommendation === "string" &&
        sig.recommendation.length >= 10
      );
    });
    check("signalsStructure", signalsValid, signalsValid ? "All signals valid" : "One or more signals malformed");

    const fillerPhrases = ["looks okay", "seems normal", "no issues found", "not applicable", "n/a", "none"];
    const weakEvidence = report.signals.some((signal) => {
      if (typeof signal !== "object" || signal === null) return true;
      const sig = signal as Record<string, unknown>;
      const evidence = typeof sig.evidence === "string" ? sig.evidence : "";
      return evidence.length < 15 || fillerPhrases.some((phrase) => evidence.toLowerCase().includes(phrase));
    });
    evidenceQuality = weakEvidence ? "weak" : report.signals.length >= 2 ? "strong" : "acceptable";
    check("evidenceQuality", !weakEvidence, weakEvidence ? "One or more signals have weak/filler evidence" : "Evidence quality acceptable");
  }

  check(
    "finalRecommendationValid",
    typeof report.finalRecommendation === "string" && VALID_RECOMMENDATIONS.includes(report.finalRecommendation)
  );
  check("confidenceValid", typeof report.confidence === "number" && report.confidence >= 0 && report.confidence <= 1);
  check("limitationsIsArray", Array.isArray(report.limitations));
  check("metadataIsObject", typeof report.metadata === "object" && report.metadata !== null);

  const recomputed = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(reportJson)));
  check("reportHashMatch", recomputed.toLowerCase() === submittedReportHash.toLowerCase(), `Expected ${submittedReportHash}, computed ${recomputed}`);
  check("beforeDeadline", new Date() < deadline);

  const reportString = JSON.stringify(report).toLowerCase();
  const harmfulPatterns = ["exploit", "payload", "shellcode", "reverse shell", "exfiltrate", "keylogger"];
  const hasHarmful = harmfulPatterns.some((pattern) => reportString.includes(pattern));
  check("noHarmfulContent", !hasHarmful, hasHarmful ? "Report contains potentially harmful content" : "No harmful content detected");

  const failedChecks = checks.filter((item) => !item.passed);
  const slashCheckNames = new Set([
    "validJson",
    "requiredFields",
    "packageNameMatch",
    "summaryReferencesPackage",
    "evidenceQuality",
    "beforeDeadline",
    "noHarmfulContent"
  ]);
  const slashRecommended = failedChecks.some((item) => slashCheckNames.has(item.name));
  const passed = failedChecks.length === 0;
  const decision: VerifierOutput["decision"] = passed ? "valid" : slashRecommended ? "invalid" : "needs_manual_review";
  const reasons = passed ? ["Report passed deterministic verification."] : failedChecks.map((item) => `${item.name}: ${item.detail ?? "failed"}`);
  const score = Math.max(0, Math.round((checks.filter((item) => item.passed).length / checks.length) * 100));
  const verificationHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify({ passed, score, reasons, missingFields, evidenceQuality, decision, slashRecommended, timestamp: Date.now() }))
  );

  return {
    valid: passed,
    passed,
    score,
    reasons,
    missingFields,
    evidenceQuality,
    decision,
    slashRecommended,
    failReason: passed ? undefined : failedChecks[0]?.name,
    checks,
    verificationHash
  };
}

function finalize({
  checks,
  missingFields,
  reason,
  slashRecommended
}: {
  checks: { name: string; passed: boolean; detail?: string }[];
  missingFields: string[];
  reason: string;
  slashRecommended: boolean;
}): VerifierResult {
  const verificationHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ passed: false, reason })));
  return {
    valid: false,
    passed: false,
    score: 0,
    reasons: [reason],
    missingFields,
    evidenceQuality: "weak",
    decision: slashRecommended ? "invalid" : "needs_manual_review",
    slashRecommended,
    failReason: reason,
    checks,
    verificationHash
  };
}
