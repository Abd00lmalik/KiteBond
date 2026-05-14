import type { RiskSignal, Severity } from "./heuristics";
import type { NpmPackageMeta } from "./npm";

const HEURIST_BASE = "https://llm-gateway.heurist.xyz";
const HEURIST_MODEL = "mistralai/mixtral-8x7b-instruct";

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
  const apiKey = process.env.HEURIST_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    console.warn("[Heurist] HEURIST_API_KEY is not set. Using deterministic fallback.");
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
    "  clean    = no significant risk factors found"
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
    `Pre-computed risk score: ${input.signalScore}/100`,
    "Pre-computed signal flags:",
    ...input.signalFlags.map((flag) => `  - ${flag}`),
    "",
    "Provide your security assessment as JSON only."
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);

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

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[Heurist] API returned non-OK:", res.status, errBody.slice(0, 300));
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

    console.log("[Heurist] Success. Severity:", parsed.severity, "Score:", parsed.riskScore);
    return { ...parsed, heuristCalled: true };
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[Heurist] Request timed out after 28s.");
    } else {
      console.error("[Heurist] Unexpected error:", err);
    }
    return buildFallback(packageName, input, false);
  }
}

function buildFallback(packageName: string, input: AnalysisInput, heuristCalled: boolean): HeuristScanReport {
  const score = input.signalScore;
  const severity: HeuristScanReport["severity"] =
    score >= 70 ? "high" : score >= 45 ? "medium" : score >= 20 ? "low" : "clean";

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
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}
