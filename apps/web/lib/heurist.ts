import type { RiskSignal, Severity } from "./heuristics";
import type { NpmPackageMeta } from "./npm";

const HEURIST_BASE = "https://llm-gateway.heurist.xyz";
const HEURIST_MODEL = "meta-llama/llama-3.3-70b-instruct";

export interface HeuristScanReport {
  severity: "critical" | "high" | "medium" | "low" | "clean";
  summary: string;
  details: string[];
  riskScore: number;
  flags: string[];
  heuristCalled: boolean;
}

interface AnalysisInput {
  version: string;
  description: string;
  author: string;
  weeklyDownloads: number;
  publishedAt: string;
  maintainerCount: number;
  hasTypes: boolean;
  licenseType: string;
  hasInstallScript: boolean;
  dependencyCount: number;
  signalFlags: string[];
  signalScore: number;
  evidenceBreakdown?: {
    confirmed: number;
    suspicious: number;
    heuristic: number;
    missing_data: number;
    historical: number;
  };
  phase?: string;
}

function scoreToReportSeverity(score: number): HeuristScanReport["severity"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "clean";
}

export interface HeuristAnalysis {
  packageName: string;
  version: string;
  riskScore: number;
  riskLevel: Severity;
  summary: string;
  signals: RiskSignal[];
  finalRecommendation: "safe_to_review" | "use_with_caution" | "avoid_until_manual_review";
  confidence: number;
  limitations: string[];
  methodology: string;
  metadata: {
    repository: string | null;
    license: string | null;
    dependencyCount: number;
    hasInstallScripts: boolean;
  };
}

export async function analyzePackageWithHeurist(
  packageName: string,
  input: AnalysisInput
): Promise<HeuristScanReport> {
  const apiKey = process.env.HEURIST_API_KEY?.trim();
  const keyStatus = apiKey ? `SET (len=${apiKey.length}, prefix=${apiKey.slice(0, 8)}...)` : "NOT SET";
  console.log("[Heurist] ==========================================");
  console.log("[Heurist] analyzePackageWithHeurist called");
  console.log(`[Heurist] Package: ${packageName}`);
  console.log(`[Heurist] Key status: ${keyStatus}`);
  console.log(`[Heurist] Model: ${HEURIST_MODEL}`);
  console.log("[Heurist] ==========================================");

  if (!apiKey) {
    console.warn("[Heurist] NO KEY - using deterministic fallback. Set HEURIST_API_KEY in Vercel.");
    return buildFallback(packageName, input, false);
  }

  const systemPrompt = [
    "You are an expert npm package supply-chain security analyst.",
    "You will be given package metadata and pre-computed risk signals.",
    "You must respond ONLY with a JSON object - no markdown, no preamble, no explanation outside the JSON.",
    "JSON schema (all fields required):",
    "{",
    '  "severity": "critical" | "high" | "medium" | "low" | "clean",',
    '  "summary": "string (80-200 chars, specific to this package)",',
    '  "details": ["string", "string", "string"],',
    '  "riskScore": integer 0-100,',
    '  "flags": ["string"]',
    "}",
    "Severity guide:",
    "  critical = active malware indicators, confirmed typosquat, or hidden install scripts",
    "  high     = strong suspicious signals, very new/unknown package with anomalies",
    "  medium   = notable risk factors, missing repo/license, low adoption",
    "  low      = minor concerns, single maintainer, slight name similarity",
    "  clean    = no significant risk factors found",
    "",
    "Calibration rules:",
    "  - Do not assign high/critical severity from weak heuristics alone (single maintainer, moderate downloads, sparse metadata).",
    "  - Treat historical incidents as documented context and distinguish whether the scanned version is affected.",
    "  - If evidence is ambiguous, explicitly describe uncertainty instead of overstating risk.",
    "  - Every conclusion must be grounded in the provided evidence."
  ].join("\n");

  const userPrompt = [
    `Package: ${packageName}@${input.version}`,
    `Description: ${input.description || "(none)"}`,
    `Author: ${input.author || "unknown"}`,
    `Weekly downloads: ${input.weeklyDownloads.toLocaleString()}`,
    `Published: ${input.publishedAt}`,
    `Maintainers: ${input.maintainerCount}`,
    `License: ${input.licenseType || "none"}`,
    `Has TypeScript types: ${input.hasTypes}`,
    `Has install/postinstall scripts: ${input.hasInstallScript}`,
    `Runtime dependency count: ${input.dependencyCount}`,
    input.evidenceBreakdown
      ? `Evidence counts - confirmed:${input.evidenceBreakdown.confirmed}, suspicious:${input.evidenceBreakdown.suspicious}, heuristic:${input.evidenceBreakdown.heuristic}, missing_data:${input.evidenceBreakdown.missing_data}, historical:${input.evidenceBreakdown.historical}`
      : "",
    input.phase ? `Analysis phase: ${input.phase}` : "",
    `Pre-computed risk score: ${input.signalScore}/100`,
    "Pre-computed signal flags:",
    ...input.signalFlags.map((flag) => `  - ${flag}`),
    "",
    "Do not invent findings that are not present in the evidence list.",
    "Provide your security assessment as JSON only."
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);

  try {
    console.log("[Heurist] Calling API. Model:", HEURIST_MODEL, "Package:", packageName);

    const res = await fetch(`${HEURIST_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: HEURIST_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 700,
        temperature: 0.1,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    console.log(`[Heurist] HTTP response status: ${res.status}`);

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[Heurist] Error body: ${errBody.slice(0, 500)}`);
      return buildFallback(packageName, input, false);
    }

    const data = (await res.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
    console.log("[Heurist] Raw response received. Finish reason:", data?.choices?.[0]?.finish_reason);

    const raw = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json|```/gi, "").trim();

    let parsed: Omit<HeuristScanReport, "heuristCalled">;
    try {
      parsed = JSON.parse(cleaned) as Omit<HeuristScanReport, "heuristCalled">;
    } catch {
      console.error("[Heurist] JSON parse failed. Raw (first 300):", cleaned.slice(0, 300));
      return buildFallback(packageName, input, false);
    }

    const validSeverities = ["critical", "high", "medium", "low", "clean"];
    if (
      !validSeverities.includes(parsed.severity) ||
      typeof parsed.summary !== "string" ||
      parsed.summary.length < 30 ||
      !Array.isArray(parsed.details) ||
      typeof parsed.riskScore !== "number"
    ) {
      console.error("[Heurist] Response failed validation:", parsed);
      return buildFallback(packageName, input, false);
    }

    console.log("[Heurist] Success. Model:", HEURIST_MODEL, "Severity:", parsed.severity, "Score:", parsed.riskScore);
    return { ...parsed, heuristCalled: true };
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[Heurist] Request timed out after 35s.");
    } else {
      console.error("[Heurist] Unexpected error:", err);
    }
    return buildFallback(packageName, input, false);
  }
}

export async function analyzeDeepPackageWithHeurist(
  packageName: string,
  input: AnalysisInput & { dependencyFlags: string[] }
): Promise<HeuristScanReport> {
  const metadata = await analyzePackageWithHeurist(packageName, {
    ...input,
    phase: "Deep Scan call 1/3 - metadata, maintainer, publication, repository, license, and incident history",
    signalFlags: input.signalFlags
  });

  const dependencies = await analyzePackageWithHeurist(packageName, {
    ...input,
    phase: "Deep Scan call 2/3 - dependency and install lifecycle risk",
    signalFlags: [...input.signalFlags, ...input.dependencyFlags]
  });

  const critic = await analyzePackageWithHeurist(packageName, {
    ...input,
    phase:
      "Deep Scan call 3/3 - skeptical critic. Downgrade claims without concrete evidence and remove false positives.",
    signalFlags: [
      ...input.signalFlags,
      ...input.dependencyFlags,
      `Metadata pass: ${metadata.severity} ${metadata.riskScore}/100 - ${metadata.summary}`,
      `Dependency pass: ${dependencies.severity} ${dependencies.riskScore}/100 - ${dependencies.summary}`
    ],
    signalScore: Math.round((metadata.riskScore + dependencies.riskScore + input.signalScore) / 3)
  });

  const riskScore = Math.round((metadata.riskScore + dependencies.riskScore + critic.riskScore) / 3);
  const severity = scoreToReportSeverity(riskScore);
  const heuristCalled = metadata.heuristCalled || dependencies.heuristCalled || critic.heuristCalled;

  return {
    severity,
    riskScore,
    heuristCalled,
    summary: critic.summary || metadata.summary,
    details: [
      "Metadata pass: " + metadata.summary,
      "Dependency pass: " + dependencies.summary,
      "Critic pass: " + critic.summary
    ],
    flags: Array.from(new Set([...metadata.flags, ...dependencies.flags, ...critic.flags])).slice(0, 10)
  };
}

function buildFallback(packageName: string, input: AnalysisInput, heuristCalled: boolean): HeuristScanReport {
  const score = input.signalScore;
  const severity = scoreToReportSeverity(score);

  return {
    severity,
    summary: `Signal-based analysis for ${packageName}@${input.version}. Heurist AI analysis unavailable - report based on automated registry signals only.`,
    details: [
      `Automated risk score: ${score}/100 from ${input.signalFlags.length} signal checks.`,
      ...input.signalFlags.slice(0, 4),
      "Manual security audit recommended before production use."
    ],
    riskScore: score,
    flags: input.signalFlags,
    heuristCalled
  };
}

export async function analyzeWithHeurist(
  meta: NpmPackageMeta,
  existingSignals: RiskSignal[],
  _scanDepth: string
): Promise<HeuristAnalysis> {
  const signalScore = existingSignals.reduce((total, signal) => {
    const weight = signal.severity === "critical" ? 35 : signal.severity === "high" ? 20 : signal.severity === "medium" ? 10 : 3;
    return total + weight;
  }, 0);

  const report = await analyzePackageWithHeurist(meta.name, {
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
    signalFlags: existingSignals.map((signal) => signal.evidence),
    signalScore: Math.min(100, signalScore)
  });

  return toHeuristAnalysis(meta, existingSignals, report);
}

export function buildFallbackAnalysis(
  meta: NpmPackageMeta,
  existingSignals: RiskSignal[],
  reason: string
): HeuristAnalysis {
  const signalScore = Math.min(
    100,
    existingSignals.reduce((total, signal) => {
      const weight = signal.severity === "critical" ? 35 : signal.severity === "high" ? 20 : signal.severity === "medium" ? 10 : 3;
      return total + weight;
    }, 0)
  );

  const report = buildFallback(
    meta.name,
    {
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
      signalFlags: [...existingSignals.map((signal) => signal.evidence), `Heurist unavailable: ${reason}`],
      signalScore
    },
    false
  );

  return toHeuristAnalysis(meta, existingSignals, report);
}

function toHeuristAnalysis(meta: NpmPackageMeta, existingSignals: RiskSignal[], report: HeuristScanReport): HeuristAnalysis {
  const riskLevel = scoreToSeverity(report.riskScore);
  return {
    packageName: meta.name,
    version: meta.version,
    riskScore: report.riskScore,
    riskLevel,
    summary: report.summary,
    signals: existingSignals,
    finalRecommendation:
      report.riskScore > 60 ? "avoid_until_manual_review" : report.riskScore >= 30 ? "use_with_caution" : "safe_to_review",
    confidence: report.heuristCalled ? 0.72 : 0.52,
    limitations: report.heuristCalled ? [] : ["Heurist unavailable; deterministic fallback was used."],
    methodology: report.heuristCalled
      ? "Heurist chat-completions analysis with deterministic registry signals"
      : "Deterministic fallback analysis from npm metadata and local risk signals",
    metadata: {
      repository: meta.repository,
      license: meta.license,
      dependencyCount: meta.dependencyCount,
      hasInstallScripts: meta.hasInstallScript
    }
  };
}

function scoreToSeverity(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "clean";
}
