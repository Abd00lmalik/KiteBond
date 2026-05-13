import type { RiskSignal, Severity } from "./heuristics";
import type { NpmPackageMeta } from "./npm";

const HEURIST_BASE = "https://llm-gateway.heurist.xyz";
const HEURIST_MODEL = process.env.HEURIST_MODEL || "meta-llama/llama-3.3-70b-instruct";

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

const SYSTEM_PROMPT = `You are a rigorous npm supply-chain security analyst with expertise in malicious package detection, typosquatting, dependency confusion attacks, and compromised maintainer scenarios.

You receive:
1. Structured npm registry metadata for a package
2. Deterministic risk signals already identified by a heuristic scanner

Your job:
- Produce a strict, evidence-based security report
- Every claim must cite a specific value from the metadata
- Do not say "looks okay" or "appears safe" without citing evidence
- Do not fabricate values. If you cannot verify something, say so in limitations
- If evidence is weak or metadata is sparse, lower your confidence score below 0.6

CRITICAL RULES:
- If ANY install script exists (preinstall/install/postinstall), flag it minimum MEDIUM severity, HIGH if script content contains network calls, exec, eval, base64, or child_process references
- If repository URL is missing AND package has dependencies, always flag MEDIUM severity
- If package is less than 30 days old, always flag HIGH severity
- If package name is 1-2 characters different from a top-100 npm package, flag CRITICAL
- If maintainer count is 0 or missing, flag MEDIUM
- If license is missing, flag LOW
- If deprecated is true, flag MEDIUM
- If description is empty or generic (< 15 chars), flag LOW
- riskScore 0-100 must reflect actual evidence: no signals = 0-15, minor signals = 15-35, moderate = 35-60, serious = 60-80, critical = 80-100
- finalRecommendation must follow from riskScore: score < 30 = safe_to_review, 30-60 = use_with_caution, > 60 = avoid_until_manual_review

RESPOND ONLY WITH VALID JSON. No preamble. No markdown fences. No explanation outside the JSON.

Required schema - every field is required:
{
  "packageName": "string - exact name from registry",
  "version": "string - exact resolved version",
  "riskScore": <integer 0-100>,
  "riskLevel": "low|medium|high|critical",
  "summary": "string - 2-4 sentences - MUST mention package name and cite at least 2 specific metadata values",
  "signals": [
    {
      "type": "install_script|dependency_risk|typosquat|maintainer_signal|metadata_signal|version_signal|repository_signal|tarball_signal",
      "severity": "low|medium|high|critical",
      "evidence": "string - minimum 20 chars - cite the actual value observed",
      "recommendation": "string - minimum 15 chars - specific action"
    }
  ],
  "finalRecommendation": "safe_to_review|use_with_caution|avoid_until_manual_review",
  "confidence": <float 0.0-1.0>,
  "limitations": ["string - what you could not verify due to metadata limits"],
  "metadata": {
    "repository": "string or null",
    "license": "string or null",
    "dependencyCount": <integer>,
    "hasInstallScripts": <boolean>
  }
}`;

function buildHeuristUserPrompt(meta: NpmPackageMeta, signals: RiskSignal[], depth: string): string {
  return `Analyze this npm package for supply-chain security risks.

SCAN DEPTH: ${depth}

NPM REGISTRY METADATA:
Package name:      ${meta.name}
Resolved version:  ${meta.version}
Latest version:    ${meta.latestVersion}
Description:       ${meta.description || "NOT PROVIDED"}
License:           ${meta.license || "NOT PROVIDED"}
Repository:        ${meta.repository || "NOT PROVIDED"}
Homepage:          ${meta.homepage || "NOT PROVIDED"}
Author:            ${meta.author || "NOT PROVIDED"}
Maintainers:       ${meta.maintainers.length > 0 ? meta.maintainers.map((m) => m.name).join(", ") : "NONE LISTED"}
Published (this v): ${meta.publishedAt || "UNKNOWN"}
Total versions:    ${meta.versionCount}
Direct deps:       ${meta.dependencyCount}
Dev deps:          ${meta.devDependencyCount}
Has install scripts: ${meta.hasInstallScript}
Script content:    ${meta.installScriptContent || "NONE"}
Keywords:          ${meta.keywords.join(", ") || "NONE"}
Deprecated:        ${meta.deprecated}
Deprecation msg:   ${meta.deprecationMessage || "NONE"}
Bugs URL:          ${meta.bugs || "NOT PROVIDED"}

DETERMINISTIC SIGNALS ALREADY IDENTIFIED:
${signals.length > 0
    ? signals.map((s) => `- [${s.severity.toUpperCase()}] ${s.type}: ${s.evidence}`).join("\n")
    : "- No deterministic signals found by heuristic scanner"}

Based on the metadata above, provide your strict security analysis as JSON.
Cite specific values from the metadata in your evidence strings.
Do not repeat signals from the list above unless you have additional evidence.`;
}

export function validateHeuristResponse(parsed: unknown, meta?: NpmPackageMeta): void {
  if (typeof parsed !== "object" || parsed === null) throw new Error("Not an object");
  const r = parsed as Record<string, unknown>;

  const required = [
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
  for (const field of required) {
    if (!(field in r)) throw new Error(`Missing field: ${field}`);
  }

  if (typeof r.packageName !== "string" || r.packageName.length === 0) throw new Error("packageName missing");
  if (typeof r.version !== "string" || r.version.length === 0) throw new Error("version missing");

  if (typeof r.riskScore !== "number" || r.riskScore < 0 || r.riskScore > 100) {
    throw new Error("riskScore must be 0-100");
  }
  if (!["low", "medium", "high", "critical"].includes(r.riskLevel as string)) {
    throw new Error("Invalid riskLevel");
  }

  if (typeof r.summary !== "string" || r.summary.length < 40) {
    throw new Error("Heurist summary too short - minimum 40 characters required");
  }
  if (meta && !r.summary.toLowerCase().includes(meta.name.toLowerCase())) {
    throw new Error("Heurist summary does not mention the package name - likely generic response");
  }

  if (!Array.isArray(r.signals)) throw new Error("signals must be array");

  const validSignalTypes = [
    "install_script",
    "dependency_risk",
    "typosquat",
    "maintainer_signal",
    "metadata_signal",
    "version_signal",
    "repository_signal",
    "tarball_signal"
  ];
  const validSeverities = ["low", "medium", "high", "critical"];
  const fillers = ["looks okay", "seems fine", "no issues", "not applicable", "n/a", "none found", "unclear"];

  for (const signal of r.signals as unknown[]) {
    if (typeof signal !== "object" || signal === null) throw new Error("Signal must be object");
    const sig = signal as Record<string, unknown>;
    if (!validSignalTypes.includes(sig.type as string)) throw new Error(`Invalid signal type: ${sig.type}`);
    if (!validSeverities.includes(sig.severity as string)) throw new Error(`Invalid signal severity: ${sig.severity}`);
    if (typeof sig.evidence !== "string" || sig.evidence.length < 20) {
      throw new Error("Signal evidence too short");
    }
    const evidenceText = sig.evidence;
    if (fillers.some((filler) => evidenceText.toLowerCase().includes(filler))) {
      throw new Error(`Signal evidence contains filler text: "${sig.evidence}"`);
    }
    if (typeof sig.recommendation !== "string" || sig.recommendation.length < 15) {
      throw new Error("Signal recommendation too short");
    }
  }

  if (!["safe_to_review", "use_with_caution", "avoid_until_manual_review"].includes(r.finalRecommendation as string)) {
    throw new Error("Invalid finalRecommendation");
  }
  if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) {
    throw new Error("confidence must be 0.0-1.0");
  }
  if (!Array.isArray(r.limitations)) throw new Error("limitations must be array");

  if (typeof r.metadata !== "object" || r.metadata === null) throw new Error("metadata must be object");
  const metadata = r.metadata as Record<string, unknown>;
  if (!(metadata.repository === null || typeof metadata.repository === "string")) throw new Error("metadata.repository invalid");
  if (!(metadata.license === null || typeof metadata.license === "string")) throw new Error("metadata.license invalid");
  if (typeof metadata.dependencyCount !== "number") throw new Error("metadata.dependencyCount invalid");
  if (typeof metadata.hasInstallScripts !== "boolean") throw new Error("metadata.hasInstallScripts invalid");

  const score = r.riskScore as number;
  const level = r.riskLevel as string;
  const expectedLevel = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";
  const levelOrder = ["low", "medium", "high", "critical"];
  if (Math.abs(levelOrder.indexOf(level) - levelOrder.indexOf(expectedLevel)) > 1) {
    throw new Error(`riskLevel "${level}" is inconsistent with riskScore ${score}`);
  }
}

function parseJsonResponse(text: string): unknown {
  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(clean);
}

export async function analyzeWithHeurist(
  meta: NpmPackageMeta,
  existingSignals: RiskSignal[],
  scanDepth: string
): Promise<HeuristAnalysis> {
  if (!process.env.HEURIST_API_KEY) {
    throw new Error("HEURIST_API_KEY is not set. Cannot perform AI analysis.");
  }

  async function attempt(): Promise<HeuristAnalysis> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let res: Response;
    try {
      res = await fetch(`${HEURIST_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HEURIST_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: HEURIST_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildHeuristUserPrompt(meta, existingSignals, scanDepth) }
          ],
          max_tokens: 1800,
          temperature: 0.1
        }),
        signal: controller.signal
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Heurist analysis timed out after 25 seconds.");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) throw new Error(`Heurist API error: ${res.status} ${res.statusText}`);

    const raw = await res.text();
    if (!raw.trim()) throw new Error("Empty response from Heurist");

    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response from Heurist");

    const parsed = parseJsonResponse(text);
    validateHeuristResponse(parsed, meta);
    const r = parsed as {
      packageName: string;
      version: string;
      riskScore: number;
      riskLevel: Severity;
      summary: string;
      signals: RiskSignal[];
      finalRecommendation: HeuristAnalysis["finalRecommendation"];
      confidence: number;
      limitations: string[];
      metadata: HeuristAnalysis["metadata"];
    };

    return {
      packageName: r.packageName,
      version: r.version,
      riskScore: r.riskScore,
      riskLevel: r.riskLevel,
      summary: r.summary,
      signals: r.signals,
      finalRecommendation: r.finalRecommendation,
      confidence: r.confidence,
      limitations: r.limitations,
      metadata: r.metadata,
      methodology: "Heurist metadata analysis with deterministic signal context"
    };
  }

  try {
    return await attempt();
  } catch (firstErr) {
    console.warn("[Heurist] First attempt failed:", firstErr);
    try {
      return await attempt();
    } catch (secondErr) {
      console.error("[Heurist] Both attempts failed:", secondErr);
      throw new Error(`Heurist analysis failed: ${secondErr instanceof Error ? secondErr.message : "unknown error"}`);
    }
  }
}
