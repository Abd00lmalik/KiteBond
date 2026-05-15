import type { RiskSignal, Severity } from "./heuristics";
import type { NpmPackageMeta } from "./npm";

const HEURIST_BASE = "https://llm-gateway.heurist.xyz";
const HEURIST_MODEL = "meta-llama/llama-3.3-70b-instruct";
const HEURIST_MESH_ENDPOINT = process.env.HEURIST_MESH_ENDPOINT?.trim() || "";
const MESH_SEARCH_AGENT = "DuckDuckGoSearchAgent";

type EvidenceGrade = "confirmed" | "suspicious" | "heuristic" | "missing_data" | "historical";
type ReportSeverity = "critical" | "high" | "medium" | "low" | "clean";

export interface HeuristFinding {
  claim: string;
  evidenceSource: string;
  confidence: number;
  evidenceGrade: EvidenceGrade;
}

export interface HeuristScanReport {
  severity: ReportSeverity;
  summary: string;
  findings: HeuristFinding[];
  details: string[];
  riskScore: number;
  flags: string[];
  recommendation: "use" | "caution" | "investigate" | "avoid";
  heuristCalled: boolean;
  unsupportedClaims: number;
  meshEvidenceUsed: boolean;
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

interface MeshIntel {
  source: string;
  evidenceLines: string[];
  latencyMs: number;
}

interface ParsedHeuristResponse {
  severity?: ReportSeverity;
  summary?: string;
  findings?: Array<Partial<HeuristFinding> & { evidence?: string }>;
  riskScore?: number;
  recommendation?: "use" | "caution" | "investigate" | "avoid";
  details?: string[];
  flags?: string[];
}

function scoreToReportSeverity(score: number): ReportSeverity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "clean";
}

function recommendationForSeverity(severity: ReportSeverity): HeuristScanReport["recommendation"] {
  if (severity === "critical" || severity === "high") return "avoid";
  if (severity === "medium") return "investigate";
  if (severity === "low") return "caution";
  return "use";
}

function buildEvidenceCorpus(input: AnalysisInput, meshEvidence: string[]): string[] {
  const rows = [
    ...input.signalFlags,
    ...meshEvidence,
    `description:${input.description}`,
    `author:${input.author}`,
    `weekly_downloads:${input.weeklyDownloads}`,
    `published_at:${input.publishedAt}`,
    `maintainers:${input.maintainerCount}`,
    `license:${input.licenseType}`,
    `has_install_script:${input.hasInstallScript}`,
    `dependency_count:${input.dependencyCount}`
  ];
  return rows.filter(Boolean).map((line) => line.toLowerCase());
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9@._/-]+/g)
    .filter((token) => token.length >= 4);
}

function claimIsSupported(claim: string, evidenceSource: string, corpus: string[]): boolean {
  const tokens = Array.from(new Set([...tokenize(claim), ...tokenize(evidenceSource)])).slice(0, 20);
  if (tokens.length === 0) return false;
  return tokens.some((token) => corpus.some((entry) => entry.includes(token)));
}

function normalizeFindings(
  parsed: ParsedHeuristResponse,
  input: AnalysisInput,
  meshEvidence: string[]
): { findings: HeuristFinding[]; unsupportedClaims: number } {
  const corpus = buildEvidenceCorpus(input, meshEvidence);
  const rawFindings = parsed.findings && parsed.findings.length > 0
    ? parsed.findings
    : (parsed.details ?? []).map((detail) => ({
        claim: detail,
        evidenceSource: detail,
        confidence: 0.58,
        evidenceGrade: "heuristic" as EvidenceGrade
      }));

  let unsupportedClaims = 0;
  const findings = rawFindings
    .map((entry) => {
      const claim = typeof entry.claim === "string" ? entry.claim.trim() : "";
      const legacyEvidence =
        "evidence" in entry && typeof (entry as { evidence?: unknown }).evidence === "string"
          ? ((entry as { evidence: string }).evidence ?? "")
          : "";
      const evidenceSourceRaw =
        typeof entry.evidenceSource === "string"
          ? entry.evidenceSource
          : legacyEvidence;
      const evidenceSource = evidenceSourceRaw.trim();
      if (!claim || !evidenceSource) return null;

      const supported = claimIsSupported(claim, evidenceSource, corpus);
      if (!supported) unsupportedClaims += 1;

      const normalizedConfidence = typeof entry.confidence === "number" ? Math.max(0, Math.min(1, entry.confidence)) : 0.6;
      const normalizedGrade: EvidenceGrade =
        entry.evidenceGrade === "confirmed" ||
        entry.evidenceGrade === "suspicious" ||
        entry.evidenceGrade === "heuristic" ||
        entry.evidenceGrade === "missing_data" ||
        entry.evidenceGrade === "historical"
          ? entry.evidenceGrade
          : supported
            ? "heuristic"
            : "missing_data";

      return {
        claim,
        evidenceSource,
        confidence: supported ? normalizedConfidence : Math.min(normalizedConfidence, 0.55),
        evidenceGrade: supported ? normalizedGrade : "heuristic"
      };
    })
    .filter((entry): entry is HeuristFinding => Boolean(entry))
    .slice(0, 8);

  return { findings, unsupportedClaims };
}

function shouldRunMeshResearch(input: AnalysisInput): boolean {
  if (input.signalScore >= 35) return true;
  return input.signalFlags.some((flag) =>
    /known incident|malicious|typosquat|account compromise|sabotage|binary files/i.test(flag)
  );
}

function flattenObjectText(value: unknown, acc: string[], depth = 0): void {
  if (depth > 4 || acc.length >= 20) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) acc.push(trimmed);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    acc.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenObjectText(item, acc, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
        const text = String(child).trim();
        if (text) acc.push(`${key}: ${text}`);
      } else {
        flattenObjectText(child, acc, depth + 1);
      }
    }
  }
}

async function maybeFetchMeshIntel(packageName: string, input: AnalysisInput, apiKey: string): Promise<MeshIntel | null> {
  if (!HEURIST_MESH_ENDPOINT) return null;
  if (!shouldRunMeshResearch(input)) return null;

  const controller = new AbortController();
  const started = Date.now();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const query = [
    `npm package security incidents for ${packageName}`,
    `version ${input.version}`,
    "maintainer compromise",
    "supply chain attack",
    "advisory"
  ].join(" ");

  try {
    const res = await fetch(HEURIST_MESH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        agent_id: MESH_SEARCH_AGENT,
        input: { query, max_results: 5 }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[Heurist Mesh] ${MESH_SEARCH_AGENT} failed: ${res.status} ${body.slice(0, 220)}`);
      return null;
    }
    const payload = (await res.json()) as Record<string, unknown>;
    const lines: string[] = [];
    flattenObjectText(payload, lines);
    const evidenceLines = Array.from(new Set(lines))
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 20)
      .slice(0, 6);

    if (evidenceLines.length === 0) return null;
    return {
      source: MESH_SEARCH_AGENT,
      evidenceLines,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Heurist Mesh] ${MESH_SEARCH_AGENT} unavailable: ${message}`);
    return null;
  }
}

function buildFallback(packageName: string, input: AnalysisInput, heuristCalled: boolean): HeuristScanReport {
  const riskScore = Math.max(0, Math.min(100, input.signalScore));
  const severity = scoreToReportSeverity(riskScore);
  const fallbackFindings = input.signalFlags.slice(0, 5).map((flag) => ({
    claim: flag,
    evidenceSource: flag,
    confidence: 0.55,
    evidenceGrade: "heuristic" as EvidenceGrade
  }));

  return {
    severity,
    summary: `Evidence-first fallback analysis for ${packageName}@${input.version}. AI reasoning unavailable in this request.`,
    findings: fallbackFindings,
    details: fallbackFindings.map((item) => item.claim),
    riskScore,
    flags: input.signalFlags.slice(0, 8),
    recommendation: recommendationForSeverity(severity),
    heuristCalled,
    unsupportedClaims: 0,
    meshEvidenceUsed: false
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

  const meshIntel = await maybeFetchMeshIntel(packageName, input, apiKey);
  if (meshIntel) {
    console.log(`[Heurist Mesh] ${meshIntel.source} evidence lines=${meshIntel.evidenceLines.length} latencyMs=${meshIntel.latencyMs}`);
  }

  const systemPrompt = [
    "You are a strict npm supply-chain security analyst for KiteBond.",
    "You receive deterministic evidence from KiteBond and optional web-research snippets from Heurist Mesh.",
    "Only reason from supplied evidence. Never infer risk from package name reputation alone.",
    "Return JSON only; no markdown, no prose outside JSON.",
    "Schema:",
    "{",
    '  "severity": "critical"|"high"|"medium"|"low"|"clean",',
    '  "summary": "string",',
    '  "findings": [',
    "    {",
    '      "claim": "string",',
    '      "evidenceSource": "string",',
    '      "confidence": 0-1,',
    '      "evidenceGrade": "confirmed"|"suspicious"|"heuristic"|"missing_data"|"historical"',
    "    }",
    "  ],",
    '  "riskScore": 0-100,',
    '  "recommendation": "use"|"caution"|"investigate"|"avoid"',
    "}",
    "Calibration rules:",
    "- critical/high require concrete evidence (confirmed malicious lifecycle behavior, proven compromise, strong incident evidence).",
    "- single maintainer or moderate download counts alone cannot justify high/critical.",
    "- if evidence is incomplete, explicitly downgrade confidence and evidenceGrade.",
    "- keep findings forensic, concrete, and traceable to supplied evidence lines."
  ].join("\n");

  const meshSection = meshIntel
    ? [
        `Mesh research source: ${meshIntel.source}`,
        ...meshIntel.evidenceLines.map((line) => `- ${line}`)
      ].join("\n")
    : "Mesh research: not used for this scan (signal threshold not met or agent unavailable).";

  const userPrompt = [
    `Package: ${packageName}@${input.version}`,
    `Description: ${input.description || "(none)"}`,
    `Author: ${input.author || "unknown"}`,
    `Weekly downloads: ${input.weeklyDownloads.toLocaleString()}`,
    `Published: ${input.publishedAt || "unknown"}`,
    `Maintainers: ${input.maintainerCount}`,
    `License: ${input.licenseType || "none"}`,
    `Has TypeScript types: ${input.hasTypes}`,
    `Has install/postinstall scripts: ${input.hasInstallScript}`,
    `Runtime dependency count: ${input.dependencyCount}`,
    input.evidenceBreakdown
      ? `Evidence counts -> confirmed:${input.evidenceBreakdown.confirmed}, suspicious:${input.evidenceBreakdown.suspicious}, heuristic:${input.evidenceBreakdown.heuristic}, missing_data:${input.evidenceBreakdown.missing_data}, historical:${input.evidenceBreakdown.historical}`
      : "",
    input.phase ? `Analysis phase: ${input.phase}` : "",
    `Deterministic signal score: ${input.signalScore}/100`,
    "Deterministic evidence lines:",
    ...input.signalFlags.map((flag) => `- ${flag}`),
    "",
    meshSection
  ]
    .filter(Boolean)
    .join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);

  try {
    console.log("[Heurist] Calling API. Model:", HEURIST_MODEL, "Package:", packageName);
    const res = await fetch(`${HEURIST_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: HEURIST_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 900,
        temperature: 0.05,
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

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
    console.log("[Heurist] Raw response received. Finish reason:", data?.choices?.[0]?.finish_reason);
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json|```/gi, "").trim();

    let parsed: ParsedHeuristResponse;
    try {
      parsed = JSON.parse(cleaned) as ParsedHeuristResponse;
    } catch {
      console.error("[Heurist] JSON parse failed. Raw (first 300):", cleaned.slice(0, 300));
      return buildFallback(packageName, input, false);
    }

    const normalizedScore = Math.max(0, Math.min(100, Math.round(parsed.riskScore ?? input.signalScore)));
    const normalizedSeverity = parsed.severity && ["critical", "high", "medium", "low", "clean"].includes(parsed.severity)
      ? parsed.severity
      : scoreToReportSeverity(normalizedScore);
    const { findings, unsupportedClaims } = normalizeFindings(parsed, input, meshIntel?.evidenceLines ?? []);
    const summary = typeof parsed.summary === "string" && parsed.summary.trim().length >= 30
      ? parsed.summary.trim()
      : `Heurist assessment generated from ${input.signalFlags.length} deterministic evidence signals.`;

    const recommendation =
      parsed.recommendation && ["use", "caution", "investigate", "avoid"].includes(parsed.recommendation)
        ? parsed.recommendation
        : recommendationForSeverity(normalizedSeverity);

    const details = findings.length > 0
      ? findings.map((finding) => `${finding.claim} -> ${finding.evidenceSource}`)
      : (parsed.details ?? []).slice(0, 4);

    const flags = findings.length > 0
      ? Array.from(new Set(findings.map((finding) => finding.claim))).slice(0, 10)
      : (parsed.flags ?? []).slice(0, 10);

    return {
      severity: normalizedSeverity,
      summary,
      findings,
      details,
      riskScore: normalizedScore,
      flags,
      recommendation,
      heuristCalled: true,
      unsupportedClaims,
      meshEvidenceUsed: Boolean(meshIntel)
    };
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
    phase: "Deep scan call 1/3 - metadata, maintainer, publication, repository, license, and incident history",
    signalFlags: input.signalFlags
  });
  const dependencies = await analyzePackageWithHeurist(packageName, {
    ...input,
    phase: "Deep scan call 2/3 - dependency and lifecycle install risk",
    signalFlags: [...input.signalFlags, ...input.dependencyFlags]
  });
  const critic = await analyzePackageWithHeurist(packageName, {
    ...input,
    phase: "Deep scan call 3/3 - skeptic critic. Remove unsupported claims and downgrade weak evidence.",
    signalFlags: [
      ...input.signalFlags,
      ...input.dependencyFlags,
      `Metadata pass score:${metadata.riskScore} severity:${metadata.severity}`,
      `Dependency pass score:${dependencies.riskScore} severity:${dependencies.severity}`
    ],
    signalScore: Math.round((metadata.riskScore + dependencies.riskScore + input.signalScore) / 3)
  });

  const riskScore = Math.round((metadata.riskScore + dependencies.riskScore + critic.riskScore) / 3);
  const severity = scoreToReportSeverity(riskScore);
  const findings = [...metadata.findings, ...dependencies.findings, ...critic.findings].slice(0, 10);

  return {
    severity,
    summary: critic.summary || metadata.summary,
    findings,
    details: [
      `Metadata pass -> ${metadata.summary}`,
      `Dependency pass -> ${dependencies.summary}`,
      `Critic pass -> ${critic.summary}`
    ],
    riskScore,
    flags: Array.from(new Set([...metadata.flags, ...dependencies.flags, ...critic.flags])).slice(0, 10),
    recommendation: recommendationForSeverity(severity),
    heuristCalled: metadata.heuristCalled || dependencies.heuristCalled || critic.heuristCalled,
    unsupportedClaims: metadata.unsupportedClaims + dependencies.unsupportedClaims + critic.unsupportedClaims,
    meshEvidenceUsed: metadata.meshEvidenceUsed || dependencies.meshEvidenceUsed || critic.meshEvidenceUsed
  };
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

export async function analyzeWithHeurist(
  meta: NpmPackageMeta,
  existingSignals: RiskSignal[],
  _scanDepth: string
): Promise<HeuristAnalysis> {
  const signalScore = existingSignals.reduce((total, signal) => {
    const weight = signal.severity === "critical" ? 35 : signal.severity === "high" ? 20 : signal.severity === "medium" ? 10 : 3;
    return total + weight;
  }, 0);
  const evidenceBreakdown = existingSignals.reduce(
    (acc, signal) => {
      const grade = signal.evidenceGrade ?? "heuristic";
      acc[grade] += 1;
      return acc;
    },
    { confirmed: 0, suspicious: 0, heuristic: 0, missing_data: 0, historical: 0 }
  );

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
    signalScore: Math.min(100, signalScore),
    evidenceBreakdown
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
    confidence: report.heuristCalled ? Math.max(0.55, 0.76 - report.unsupportedClaims * 0.04) : 0.52,
    limitations: report.heuristCalled ? [] : ["Heurist unavailable; deterministic fallback was used."],
    methodology: report.heuristCalled
      ? "Heurist chat-completions with deterministic signals and optional Heurist Mesh web evidence"
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
