"use client";

import { Badge } from "@/components/shared/Badge";
import type { Severity } from "@/lib/heuristics";

type FindingRecord = {
  title?: string;
  claim?: string;
  description?: string;
  evidence?: string;
  evidenceSource?: string;
  reasoning?: string;
  recommendation?: string;
  severity?: Severity | string;
  code?: string;
  snippet?: string;
  language?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSeverity(value: unknown): Severity | null {
  const severity = asString(value)?.toLowerCase();
  if (severity === "critical" || severity === "high" || severity === "medium" || severity === "low" || severity === "clean") {
    return severity;
  }
  if (severity === "info") return "low";
  return null;
}

function getFindings(reportJson: unknown): FindingRecord[] {
  if (!isRecord(reportJson)) return [];
  const direct = Array.isArray(reportJson.findings) ? reportJson.findings : null;
  const signals = Array.isArray(reportJson.signals) ? reportJson.signals : null;
  const source = direct?.length ? direct : signals;
  return (source || []).filter(isRecord).map((item) => item as FindingRecord);
}

function getSummary(reportJson: unknown) {
  if (!isRecord(reportJson)) return null;
  return asString(reportJson.summary) || asString(reportJson.finalRecommendation);
}

function getSnippet(finding: FindingRecord) {
  return asString(finding.code) || asString(finding.snippet);
}

export function FindingsRenderer({ reportJson }: { reportJson: unknown }) {
  const findings = getFindings(reportJson);
  const summary = getSummary(reportJson);

  if (!summary && findings.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">No structured findings were attached to this submission.</p>;
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-card)] p-4">
          <p className="label">Summary</p>
          <p className="mt-2 text-sm text-[var(--text-primary)]">{summary}</p>
        </div>
      )}

      {findings.map((finding, index) => {
        const title = asString(finding.title) || asString(finding.claim) || `Finding ${index + 1}`;
        const description = asString(finding.description) || asString(finding.evidence) || asString(finding.evidenceSource);
        const reasoning = asString(finding.reasoning) || asString(finding.recommendation);
        const severity = normalizeSeverity(finding.severity);
        const snippet = getSnippet(finding);
        const language = asString(finding.language) || "text";

        return (
          <article key={`${title}-${index}`} className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-glass)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              {severity && <Badge tone={severity} label={severity} />}
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
            </div>
            {description && <p className="mt-3 text-sm text-[var(--text-secondary)]">{description}</p>}
            {snippet && (
              <pre className="mt-3 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--border-dim)] bg-black/50 p-3 text-xs text-[var(--text-primary)]">
                <code data-language={language}>{snippet}</code>
              </pre>
            )}
            {reasoning && (
              <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--border-dim)] bg-[var(--bg-card)] p-3">
                <p className="label">Evidence / Reasoning</p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{reasoning}</p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
