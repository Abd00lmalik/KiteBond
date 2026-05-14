import type { NpmPackageMeta } from "./npm";

export interface SecuritySignals {
  riskScore: number;
  flags: SecurityFlag[];
}

export interface SecurityFlag {
  code: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
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
const DANGEROUS_SCRIPT_KEYWORDS = ["curl ", "wget ", "base64", "eval(", "exec(", "spawn(", "child_process", "http://", "https://"];

export function extractSignals(meta: NpmPackageMeta, packageInput: string): SecuritySignals {
  const flags: SecurityFlag[] = [];
  let score = 0;

  const inputLower = packageInput.trim().toLowerCase();
  for (const known of KNOWN_POPULAR) {
    const distance = levenshtein(inputLower, known);
    if (inputLower !== known && distance <= 2) {
      flags.push({
        code: "TYPOSQUAT_RISK",
        severity: "critical",
        message: `Package name "${inputLower}" is ${distance} character(s) from well-known package "${known}". Possible typosquat.`
      });
      score += 45;
    }
  }

  if (!meta.repository) {
    flags.push({
      code: "NO_REPOSITORY",
      severity: "medium",
      message: "No repository URL listed. Source code cannot be independently verified."
    });
    score += 15;
  }

  if (!meta.license || meta.license === "none" || meta.license === "UNLICENSED") {
    flags.push({
      code: "NO_LICENSE",
      severity: "medium",
      message: "No license declared. Usage rights are legally undefined."
    });
    score += 12;
  }

  if (meta.hasInstallScript) {
    flags.push({
      code: "INSTALL_SCRIPT",
      severity: "high",
      message: "Package contains install/postinstall scripts that execute at npm install time. This is a common malware vector."
    });
    score += 30;
  }

  const suspiciousScripts = (meta.scriptValues ?? []).filter((script) =>
    DANGEROUS_SCRIPT_KEYWORDS.some((keyword) => script.includes(keyword))
  );
  if (suspiciousScripts.length > 0) {
    flags.push({
      code: "SUSPICIOUS_SCRIPT_CONTENT",
      severity: "critical",
      message: `Package script content contains suspicious keywords (${suspiciousScripts.length} match(es)). Manual inspection required before install.`
    });
    score += 40;
  }

  if (meta.weeklyDownloads < 500) {
    flags.push({
      code: "LOW_DOWNLOADS",
      severity: "medium",
      message: `Only ${meta.weeklyDownloads.toLocaleString()} weekly downloads. Minimal community vetting.`
    });
    score += 12;
  } else if (meta.weeklyDownloads < 5000) {
    flags.push({
      code: "MODERATE_DOWNLOADS",
      severity: "low",
      message: `${meta.weeklyDownloads.toLocaleString()} weekly downloads - low-to-moderate adoption.`
    });
    score += 5;
  }

  const firstDate = meta.firstPublishedAt ? new Date(meta.firstPublishedAt) : null;
  const ageDays = firstDate && !Number.isNaN(firstDate.getTime()) ? (Date.now() - firstDate.getTime()) / 86_400_000 : 999;
  if (ageDays < 7) {
    flags.push({
      code: "VERY_NEW_PACKAGE",
      severity: "high",
      message: "Package is less than 7 days old. Insufficient track record."
    });
    score += 28;
  } else if (ageDays < 30) {
    flags.push({
      code: "RECENT_PACKAGE",
      severity: "medium",
      message: "Package is less than 30 days old."
    });
    score += 14;
  }

  if (meta.maintainerCount === 1) {
    flags.push({
      code: "SINGLE_MAINTAINER",
      severity: "low",
      message: "Package has only one maintainer. Single point of compromise or abandonment."
    });
    score += 8;
  }

  if (meta.totalVersions === 1) {
    flags.push({
      code: "SINGLE_VERSION",
      severity: "medium",
      message: "Only one version ever published. No history of maintenance."
    });
    score += 10;
  } else if (meta.totalVersions > 200) {
    flags.push({
      code: "VERY_HIGH_VERSION_COUNT",
      severity: "low",
      message: `${meta.totalVersions} versions published. Unusual churn rate.`
    });
    score += 4;
  }

  if (meta.dependencyCount > 30) {
    flags.push({
      code: "HIGH_DEPENDENCY_COUNT",
      severity: "medium",
      message: `${meta.dependencyCount} runtime dependencies. Large transitive attack surface.`
    });
    score += 12;
  }

  if (!meta.description || meta.description.trim().length < 10) {
    flags.push({
      code: "NO_DESCRIPTION",
      severity: "low",
      message: "Package has no meaningful description. May indicate a placeholder or test package."
    });
    score += 6;
  }

  return { riskScore: Math.min(100, score), flags };
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
