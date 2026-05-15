import type { NpmPackageMeta } from "./npm";
import { KNOWN_INCIDENTS, isIncidentVersionAffected } from "./knownIncidents";
import type { TarballInspection } from "./tarball";

export interface SecuritySignals {
  riskScore: number;
  flags: SecurityFlag[];
}

export interface SecurityFlag {
  code: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  evidenceGrade: "confirmed" | "suspicious" | "heuristic" | "missing_data" | "historical";
}

const KNOWN_POPULAR = new Set([
  "@babel/core",
  "@babel/preset-env",
  "@babel/runtime",
  "@emotion/react",
  "@emotion/styled",
  "@testing-library/react",
  "@types/node",
  "@types/react",
  "@vitejs/plugin-react",
  "acorn",
  "ajv",
  "ansi-styles",
  "ansi-regex",
  "async",
  "autoprefixer",
  "axios",
  "babel-core",
  "body-parser",
  "chalk",
  "classnames",
  "commander",
  "cookie",
  "cors",
  "cross-env",
  "css-loader",
  "date-fns",
  "debug",
  "deepmerge",
  "dotenv",
  "eslint",
  "eslint-plugin-react",
  "express",
  "fast-glob",
  "file-loader",
  "formik",
  "fs-extra",
  "glob",
  "graceful-fs",
  "helmet",
  "html-webpack-plugin",
  "inquirer",
  "isarray",
  "jquery",
  "jest",
  "js-yaml",
  "json5",
  "jsonfile",
  "jsonwebtoken",
  "less",
  "lodash",
  "mongoose",
  "minimist",
  "mkdirp",
  "moment",
  "ms",
  "next",
  "node-fetch",
  "nodemon",
  "normalize-path",
  "npm",
  "parse-json",
  "passport",
  "postcss",
  "prettier",
  "prop-types",
  "react",
  "react-dom",
  "react-is",
  "react-router",
  "react-router-dom",
  "redux",
  "resolve",
  "rimraf",
  "rollup",
  "rxjs",
  "sass",
  "semver",
  "sequelize",
  "source-map",
  "style-loader",
  "strip-ansi",
  "styled-components",
  "tailwindcss",
  "ts-node",
  "tslib",
  "typescript",
  "underscore",
  "url-loader",
  "uuid",
  "vite",
  "vue",
  "vue-router",
  "webpack",
  "webpack-cli",
  "ws",
  "yargs",
  "zod"
]);
const TOP_PACKAGES = new Set([
  "lodash",
  "react",
  "react-dom",
  "express",
  "axios",
  "typescript",
  "webpack",
  "babel-core",
  "@babel/core",
  "eslint",
  "jest",
  "mocha",
  "moment",
  "chalk",
  "commander",
  "dotenv",
  "uuid",
  "underscore",
  "ramda",
  "async",
  "bluebird",
  "request",
  "cheerio",
  "mongoose",
  "sequelize",
  "next",
  "vue",
  "angular",
  "@angular/core",
  "jquery",
  "rxjs",
  "redux",
  "mobx",
  "tailwindcss",
  "postcss",
  "sass",
  "vite",
  "rollup",
  "esbuild",
  "prettier",
  "husky",
  "nodemon",
  "pm2",
  "cors",
  "helmet",
  "passport",
  "jsonwebtoken",
  "bcrypt"
]);
const MALWARE_SCRIPT_PATTERNS = [
  /\bcurl\b.*\|.*\bsh\b/i,
  /\bwget\b.*\|.*\bsh\b/i,
  /\beval\s*\(.*atob/i,
  /\beval\s*\(.*Buffer.*base64/i,
  /require\s*\(\s*['"]child_process['"].*exec/i,
  /\bbase64\b.*\|\s*\bbash\b/i
];
const SUSPICIOUS_DEP_PATTERNS = [
  /^[a-z]{1,2}$/i,
  /(^|-)postinstall(-|$)/i,
  /(^|-)install(-|$)/i,
  /(^|-)loader(-|$)/i,
  /(fix|patch|hotfix)$/i
];

export function extractSignals(meta: NpmPackageMeta, packageInput: string, tarball?: TarballInspection | null): SecuritySignals {
  const flags: SecurityFlag[] = [];
  let score = 0;

  const inputLower = packageInput.trim().toLowerCase();
  const nameLower = meta.name.toLowerCase();
  const isTopPackage = TOP_PACKAGES.has(inputLower) || TOP_PACKAGES.has(nameLower);

  const incident = KNOWN_INCIDENTS[nameLower];
  if (incident) {
    const affectedVersion = isIncidentVersionAffected(meta.version, incident);
    const historicalSeverity: SecurityFlag["severity"] =
      incident.incidentType === "historical_vulnerability"
        ? "low"
        : incident.historicalScore >= 70
          ? "high"
          : "medium";
    flags.push({
      code: "KNOWN_INCIDENT",
      severity: affectedVersion ? "critical" : historicalSeverity,
      message: `${incident.summary}${incident.affectedVersions?.length ? ` Affected versions: ${incident.affectedVersions.join(", ")}.` : ""} ${
        affectedVersion ? "The scanned version appears to match an affected range." : "No direct affected-version match was detected for this scan."
      } ${incident.recommendation}${incident.source ? ` Source: ${incident.source}` : ""}`,
      evidenceGrade: "historical"
    });
    score += affectedVersion ? incident.affectedVersionScore : incident.historicalScore;
  }

  const typosquatCandidate = getTyposquatCandidate(inputLower);
  if (typosquatCandidate) {
    const typoSeverity = typosquatCandidate.distance <= 1 ? "critical" : "high";
    flags.push({
      code: "TYPOSQUAT_RISK",
      severity: typoSeverity,
      message: `Package name "${inputLower}" is ${typosquatCandidate.distance} character(s) from "${typosquatCandidate.target}". Potential typosquat.`,
      evidenceGrade: "suspicious"
    });
    score += typoSeverity === "critical" ? 45 : 28;
  }

  if (!meta.repository) {
    flags.push({
      code: "NO_REPOSITORY",
      severity: "medium",
      message: "No repository URL listed. Source code cannot be independently verified.",
      evidenceGrade: "missing_data"
    });
    score += 15;
  } else if (!repositoryLooksRelated(meta.repository, meta.name)) {
    flags.push({
      code: "REPOSITORY_MISMATCH",
      severity: "medium",
      message: "Repository URL does not clearly match the package identity. Verify ownership and publish provenance.",
      evidenceGrade: "suspicious"
    });
    score += 10;
  }

  if (!meta.license || meta.license === "none" || meta.license === "UNLICENSED") {
    flags.push({
      code: "NO_LICENSE",
      severity: "medium",
      message: "No license declared. Usage rights are legally undefined.",
      evidenceGrade: "missing_data"
    });
    score += 12;
  }

  const lifecycleScripts = meta.lifecycleScriptValues ?? [];
  const maliciousScripts = lifecycleScripts.filter((script) => MALWARE_SCRIPT_PATTERNS.some((pattern) => pattern.test(script)));
  if (maliciousScripts.length > 0) {
    flags.push({
      code: "MALICIOUS_INSTALL_SCRIPT",
      severity: "critical",
      message: "Install lifecycle script matches known malware patterns. Inspect before install.",
      evidenceGrade: "confirmed"
    });
    score += 40;
  } else if (lifecycleScripts.length > 0) {
    flags.push({
      code: "HAS_INSTALL_SCRIPT",
      severity: "low",
      message: "Package has install lifecycle script(s). Review script content before installing in sensitive environments.",
      evidenceGrade: "heuristic"
    });
    score += 8;
  }

  if (!isTopPackage && meta.weeklyDownloads === 0) {
    flags.push({
      code: "NO_DOWNLOADS",
      severity: "high",
      message: "Package has zero recorded downloads.",
      evidenceGrade: "heuristic"
    });
    score += 25;
  } else if (!isTopPackage && meta.weeklyDownloads < 100) {
    flags.push({
      code: "VERY_LOW_DOWNLOADS",
      severity: "high",
      message: `Only ${meta.weeklyDownloads} weekly downloads. Extremely low adoption.`,
      evidenceGrade: "heuristic"
    });
    score += 20;
  } else if (!isTopPackage && meta.weeklyDownloads < 1000) {
    flags.push({
      code: "LOW_DOWNLOADS",
      severity: "medium",
      message: `${meta.weeklyDownloads.toLocaleString()} weekly downloads. Low community adoption.`,
      evidenceGrade: "heuristic"
    });
    score += 12;
  } else if (!isTopPackage && meta.weeklyDownloads < 10_000) {
    flags.push({
      code: "MODERATE_DOWNLOADS",
      severity: "low",
      message: `${meta.weeklyDownloads.toLocaleString()} weekly downloads - moderate adoption.`,
      evidenceGrade: "heuristic"
    });
    score += 4;
  }

  const firstDate = meta.firstPublishedAt ? new Date(meta.firstPublishedAt) : null;
  const ageDays = firstDate && !Number.isNaN(firstDate.getTime()) ? (Date.now() - firstDate.getTime()) / 86_400_000 : 999;
  if (ageDays < 7) {
    flags.push({
      code: "VERY_NEW_PACKAGE",
      severity: "high",
      message: "Package is less than 7 days old. Insufficient track record.",
      evidenceGrade: "heuristic"
    });
    score += 28;
  } else if (ageDays < 30) {
    flags.push({
      code: "RECENT_PACKAGE",
      severity: "medium",
      message: "Package is less than 30 days old.",
      evidenceGrade: "heuristic"
    });
    score += 14;
  }

  if (meta.maintainerCount === 1) {
    flags.push({
      code: "SINGLE_MAINTAINER",
      severity: "low",
      message: incident?.maintenanceConcern
        ? "Single maintainer with a documented package history concern. Succession risk for long-term projects."
        : "Package has only one maintainer. Single point of compromise or abandonment.",
      evidenceGrade: "heuristic"
    });
    score += 8;
  }

  if (incident?.maintenanceConcern) {
    flags.push({
      code: "NO_ACTIVE_MAINTENANCE",
      severity: "medium",
      message: incident.maintenanceConcern,
      evidenceGrade: "historical"
    });
    score += 12;
  }

  const publishAgeDays = meta.publishedAt ? daysSince(meta.publishedAt) : null;
  if (publishAgeDays !== null && publishAgeDays > 365 * 2) {
    flags.push({
      code: "NO_ACTIVE_MAINTENANCE",
      severity: "medium",
      message: `Latest release is ${Math.round(publishAgeDays)} day(s) old. Maintenance appears stagnant.`,
      evidenceGrade: "heuristic"
    });
    score += 10;
  }

  if (meta.totalVersions === 1) {
    flags.push({
      code: "SINGLE_VERSION",
      severity: "medium",
      message: "Only one version ever published. No history of maintenance.",
      evidenceGrade: "heuristic"
    });
    score += 10;
  } else if (meta.totalVersions > 200) {
    flags.push({
      code: "VERY_HIGH_VERSION_COUNT",
      severity: "low",
      message: `${meta.totalVersions} versions published. Unusual churn rate.`,
      evidenceGrade: "heuristic"
    });
    score += 4;
  }

  if (meta.dependencyCount > 30) {
    flags.push({
      code: "HIGH_DEPENDENCY_COUNT",
      severity: "medium",
      message: `${meta.dependencyCount} runtime dependencies. Large transitive attack surface.`,
      evidenceGrade: "heuristic"
    });
    score += 12;
  }

  const suspiciousDeps = meta.dependencyNames.filter((dep) => SUSPICIOUS_DEP_PATTERNS.some((pattern) => pattern.test(dep)));
  if (suspiciousDeps.length > 0) {
    flags.push({
      code: "SUSPICIOUS_DEPENDENCY_NAMES",
      severity: suspiciousDeps.length > 2 ? "high" : "medium",
      message: `Dependency names with suspicious patterns detected: ${suspiciousDeps.slice(0, 6).join(", ")}.`,
      evidenceGrade: "suspicious"
    });
    score += suspiciousDeps.length > 2 ? 18 : 10;
  }

  if (!meta.description || meta.description.trim().length < 10) {
    flags.push({
      code: "NO_DESCRIPTION",
      severity: "low",
      message: "Package has no meaningful description. May indicate a placeholder or test package.",
      evidenceGrade: "missing_data"
    });
    score += 6;
  }

  if (tarball) {
    if (tarball.hasBinaryFiles) {
      flags.push({
        code: "BINARY_FILES_IN_PACKAGE",
        severity: "high",
        message: "Package contains binary files. Binary artifacts in npm packages are a supply-chain risk vector.",
        evidenceGrade: "confirmed"
      });
      score += 30;
    }

    if (tarball.hasHiddenFiles) {
      flags.push({
        code: "HIDDEN_FILES",
        severity: "medium",
        message: "Package contains hidden files (starting with .). Review before installation.",
        evidenceGrade: "suspicious"
      });
      score += 12;
    }

    if (tarball.suspiciousExtensions.length > 0) {
      flags.push({
        code: "SCRIPT_FILES_IN_PACKAGE",
        severity: "high",
        message: `Package contains script files at root level: ${tarball.suspiciousExtensions.join(", ")}.`,
        evidenceGrade: "confirmed"
      });
      score += 25;
    }

    if (tarball.fileCount > 500) {
      flags.push({
        code: "LARGE_FILE_COUNT",
        severity: "low",
        message: `Package contains ${tarball.fileCount} files. Unusually large package footprint.`,
        evidenceGrade: "heuristic"
      });
      score += 5;
    }
  }

  if (isTopPackage) {
    score = Math.max(0, score - 25);
    const filteredFlags = flags.filter(
      (flag) => flag.severity === "critical" || flag.severity === "high" || (flag.code === "KNOWN_INCIDENT" && flag.severity !== "low")
    );
    return { riskScore: Math.min(100, score), flags: filteredFlags };
  }

  return { riskScore: Math.min(100, score), flags };
}

function getTyposquatCandidate(inputLower: string): { target: string; distance: number } | null {
  if (!inputLower || inputLower.length < 3) return null;
  let candidate: { target: string; distance: number } | null = null;
  for (const known of KNOWN_POPULAR) {
    if (known === inputLower) continue;
    const distance = levenshtein(inputLower, known);
    if (!isTyposquatRisk(inputLower, known, distance)) continue;
    if (!candidate || distance < candidate.distance) {
      candidate = { target: known, distance };
    }
  }
  return candidate;
}

function isTyposquatRisk(inputLower: string, known: string, distance: number): boolean {
  if (inputLower === known) return false;
  const lengthDelta = Math.abs(inputLower.length - known.length);
  const sharedPrefix = commonPrefixLen(inputLower, known);
  if (distance <= 1 && lengthDelta <= 1 && sharedPrefix >= 2) return true;
  return distance === 2 && inputLower.length <= 8 && known.length <= 8 && lengthDelta <= 1 && sharedPrefix >= 3;
}

function commonPrefixLen(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let idx = 0;
  while (idx < limit && a[idx] === b[idx]) idx += 1;
  return idx;
}

function repositoryLooksRelated(repositoryUrl: string, packageName: string): boolean {
  const normalizedRepo = repositoryUrl.toLowerCase();
  const normalizedPackage = packageName.toLowerCase().replace(/^@/, "").replace(/\//g, "-");
  return normalizedRepo.includes(packageName.toLowerCase()) || normalizedRepo.includes(normalizedPackage);
}

function daysSince(isoTime: string): number | null {
  const parsed = new Date(isoTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return (Date.now() - parsed.getTime()) / 86_400_000;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_unused, i) =>
    Array.from({ length: n + 1 }, (_unused2, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
