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

const SYSTEM_PROMPT = `You are a rigorous npm supply-chain security analyst.
You receive structured npm package metadata and deterministic risk signals already identified by a heuristic scanner.
Your job is to produce a strict, evidence-based security analysis.

RULES:
- Every finding must cite specific evidence from the metadata provided.
- Do not use vague statements like "looks okay" or "seems normal."
- Do not fabricate evidence. If you cannot confirm something, state your uncertainty in limitations.
- Do not repeat what the heuristic scanner already identified unless you have additional evidence.
- riskScore must reflect actual evidence, not guess. If evidence is weak, set confidence below 0.6.
- finalRecommendation must be justified in the summary.
- If the package appears to be a commonly used, well-maintained open-source library with no signals, say so concisely and set finalRecommendation: "safe_to_review" with confidence around 0.85.
- If ANY install script exists, always flag it as at minimum medium severity.
- If repository URL is missing and the package has dependencies, always flag it.
- If the package is less than 30 days old, always flag it.

RESPOND ONLY WITH A JSON OBJECT. No preamble. No markdown. No explanation outside the JSON.

Required schema:
{
  "packageName": "string",
  "version": "string",
  "riskScore": <integer 0-100>,
  "riskLevel": "low | medium | high | critical",
  "summary": "<2-4 sentences — cite actual metadata values>",
  "signals": [
    {
      "type": "install_script | dependency_risk | typosquat | maintainer_signal | metadata_signal | version_signal | repository_signal | tarball_signal",
      "severity": "low | medium | high | critical",
      "evidence": "<specific observable fact — not speculation>",
      "recommendation": "<concrete action>"
    }
  ],
  "finalRecommendation": "safe_to_review | use_with_caution | avoid_until_manual_review",
  "confidence": <float 0.0-1.0>,
  "limitations": ["<what you could not verify>"],
  "metadata": {
    "repository": "<string or null>",
    "license": "<string or null>",
    "dependencyCount": <integer>,
    "hasInstallScripts": <boolean>
  }
}`;

function buildUserPrompt(meta: NpmPackageMeta, existingSignals: RiskSignal[], depth: string) {
  return `Analyze this npm package for supply-chain security risk.

SCAN DEPTH: ${depth}

PACKAGE METADATA:
- Name: ${meta.name}
- Version: ${meta.version} (latest: ${meta.latestVersion})
- Description: ${meta.description}
- License: ${meta.license ?? "not specified"}
- Repository: ${meta.repository ?? "not specified"}
- Homepage: ${meta.homepage ?? "not specified"}
- Author: ${meta.author ?? "not specified"}
- Maintainers: ${meta.maintainers.map((m) => m.name).join(", ") || "not specified"}
- Published: ${meta.publishedAt ?? "unknown"}
- Total versions: ${meta.versionCount}
- Direct dependencies: ${meta.dependencyCount}
- Dev dependencies: ${meta.devDependencyCount}
- Has lifecycle scripts: ${meta.hasInstallScript}
- Script content: ${meta.installScriptContent ?? "none"}
- Keywords: ${meta.keywords.join(", ") || "none"}
- Deprecated: ${meta.deprecated}
- Deprecation message: ${meta.deprecationMessage ?? "none"}

DETERMINISTIC SIGNALS:
${existingSignals.length > 0 ? existingSignals.map((s) => `- [${s.severity}] ${s.type}: ${s.evidence}`).join("\n") : "- None"}`;
}

export function validateHeuristResponse(parsed: unknown): void {
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

  if (typeof r.summary !== "string" || r.summary.length < 20) {
    throw new Error("summary too short or missing");
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

  for (const signal of r.signals as unknown[]) {
    if (typeof signal !== "object" || signal === null) throw new Error("Signal must be object");
    const sig = signal as Record<string, unknown>;
    if (!validSignalTypes.includes(sig.type as string)) throw new Error(`Invalid signal type: ${sig.type}`);
    if (!validSeverities.includes(sig.severity as string)) throw new Error(`Invalid signal severity: ${sig.severity}`);
    if (typeof sig.evidence !== "string" || sig.evidence.length < 10) {
      throw new Error("Signal evidence too short");
    }
    if (typeof sig.recommendation !== "string" || sig.recommendation.length < 10) {
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
            { role: "user", content: buildUserPrompt(meta, existingSignals, scanDepth) }
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
    validateHeuristResponse(parsed);
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
