import type { NpmPackageMeta } from "./npm";
import { KNOWN_INCIDENTS } from "./knownIncidents";

export type Severity = "clean" | "low" | "medium" | "high" | "critical";

export interface RiskSignal {
  type:
    | "install_script"
    | "dependency_risk"
    | "typosquat"
    | "maintainer_signal"
    | "metadata_signal"
    | "version_signal"
    | "repository_signal"
    | "tarball_signal";
  severity: Severity;
  evidence: string;
  recommendation: string;
}

const POPULAR_PACKAGES = [
  "lodash",
  "axios",
  "express",
  "react",
  "vue",
  "angular",
  "typescript",
  "webpack",
  "babel",
  "eslint",
  "prettier",
  "jest",
  "mocha",
  "chai",
  "moment",
  "dayjs",
  "uuid",
  "dotenv",
  "cors",
  "chalk",
  "commander",
  "inquirer",
  "yargs",
  "debug",
  "winston"
];

const MALWARE_SCRIPT_PATTERNS = [
  /\bcurl\b.*\|.*\bsh\b/i,
  /\bwget\b.*\|.*\bsh\b/i,
  /\beval\s*\(.*atob/i,
  /\beval\s*\(.*Buffer.*base64/i,
  /require\s*\(\s*['"]child_process['"].*exec/i,
  /\bbase64\b.*\|\s*\bbash\b/i
];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_unused, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[a.length][b.length];
}

export function computeRiskSignals(meta: NpmPackageMeta): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const isPopular = POPULAR_PACKAGES.includes(meta.name.toLowerCase());
  const incident = KNOWN_INCIDENTS[meta.name.toLowerCase()];

  if (incident) {
    signals.push({
      type: "metadata_signal",
      severity: incident.severity,
      evidence: `${incident.summary}${incident.affectedVersions ? ` Affected: ${incident.affectedVersions}.` : ""} ${incident.recommendation}`,
      recommendation: incident.recommendation
    });
  }

  if (meta.hasInstallScript) {
    const content = meta.installScriptContent ?? "";
    const hasMalwarePattern = (meta.lifecycleScriptValues ?? []).some((script) =>
      MALWARE_SCRIPT_PATTERNS.some((pattern) => pattern.test(script))
    );
    if (hasMalwarePattern) {
      signals.push({
        type: "install_script",
        severity: "critical",
        evidence: `Package lifecycle script matches known malware patterns: ${content.slice(0, 200)}`,
        recommendation: "Package runs suspicious code during installation. Do not install without manual review."
      });
    } else {
      signals.push({
        type: "install_script",
        severity: "low",
        evidence: `Package has lifecycle scripts: ${content.slice(0, 200)}`,
        recommendation: "Package runs scripts during installation. Review the script content before installing in sensitive environments."
      });
    }
  }

  const normalizedName = meta.name.toLowerCase().replace(/[-_]/g, "");
  for (const popular of POPULAR_PACKAGES) {
    const popularName = popular.toLowerCase().replace(/[-_]/g, "");
    if (normalizedName !== popularName && normalizedName.length > 2) {
      const distance = levenshtein(normalizedName, popularName);
      const lengthDelta = Math.abs(normalizedName.length - popularName.length);
      const typosquatRisk = distance <= 1 || (distance === 2 && normalizedName.length <= 8 && popularName.length <= 8 && lengthDelta <= 1);
      if (typosquatRisk) {
        signals.push({
          type: "typosquat",
          severity: distance === 1 ? "critical" : "high",
          evidence: `Package name "${meta.name}" is ${distance} character(s) away from popular package "${popular}".`,
          recommendation: `Verify this is not a typosquatting attempt of "${popular}".`
        });
        break;
      }
    }
  }

  if (meta.deprecated) {
    signals.push({
      type: "metadata_signal",
      severity: "medium",
      evidence: `Package is deprecated: ${meta.deprecationMessage ?? "no message"}`,
      recommendation: "Find an actively maintained alternative."
    });
  }

  if (!meta.license) {
    signals.push({
      type: "metadata_signal",
      severity: "low",
      evidence: "Package has no license specified.",
      recommendation: "Check legal compatibility before use."
    });
  }

  if (!meta.repository) {
    signals.push({
      type: "repository_signal",
      severity: "medium",
      evidence: "Package has no linked repository.",
      recommendation: "Source provenance is harder to verify. Treat with caution."
    });
  }

  if (meta.publishedAt) {
    const ageDays = (Date.now() - new Date(meta.publishedAt).getTime()) / 86_400_000;
    if (ageDays < 7) {
      signals.push({
        type: "version_signal",
        severity: "high",
        evidence: `Package version was published ${Math.max(0, Math.round(ageDays))} day(s) ago.`,
        recommendation: "Very new package versions should be reviewed before installation."
      });
    } else if (ageDays < 30) {
      signals.push({
        type: "version_signal",
        severity: "medium",
        evidence: `Package version was published ${Math.round(ageDays)} day(s) ago.`,
        recommendation: "Recent package versions may not have been widely reviewed."
      });
    }
  }

  if (!isPopular && meta.weeklyDownloads === 0) {
    signals.push({
      type: "metadata_signal",
      severity: "high",
      evidence: "Package has zero recorded weekly downloads.",
      recommendation: "Avoid until adoption and provenance can be verified."
    });
  } else if (!isPopular && meta.weeklyDownloads < 1000) {
    signals.push({
      type: "metadata_signal",
      severity: meta.weeklyDownloads < 100 ? "high" : "medium",
      evidence: `Package has ${meta.weeklyDownloads.toLocaleString()} weekly downloads.`,
      recommendation: "Low-adoption packages need extra provenance checks."
    });
  }

  if (meta.versionCount === 1) {
    signals.push({
      type: "version_signal",
      severity: "medium",
      evidence: "Package has only one published version.",
      recommendation: "Single-version packages are common in supply-chain abuse. Verify maintainer intent."
    });
  }

  if (meta.maintainers.length === 0) {
    signals.push({
      type: "maintainer_signal",
      severity: "medium",
      evidence: "No maintainer information available.",
      recommendation: "Package ownership cannot be verified from registry metadata."
    });
  }

  if (incident?.maintenanceConcern) {
    signals.push({
      type: "maintainer_signal",
      severity: "medium",
      evidence: incident.maintenanceConcern,
      recommendation: incident.recommendation
    });
  }

  if (meta.dependencyCount > 50) {
    signals.push({
      type: "dependency_risk",
      severity: "medium",
      evidence: `Package has ${meta.dependencyCount} direct dependencies.`,
      recommendation: "High dependency count increases supply-chain risk surface."
    });
  }

  return isPopular ? signals.filter((signal) => signal.severity === "critical" || signal.severity === "high") : signals;
}

export function computeRiskScore(signals: RiskSignal[]): number {
  const weights: Record<Severity, number> = { clean: 0, critical: 35, high: 20, medium: 10, low: 3 };
  return Math.min(100, signals.reduce((sum, signal) => sum + weights[signal.severity], 0));
}

export function computeRiskLevel(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "clean";
}
