export interface KnownIncident {
  incidentType:
    | "supply_chain_compromise"
    | "maintainer_sabotage"
    | "account_hijack"
    | "historical_vulnerability";
  confidence: "confirmed" | "high" | "medium";
  summary: string;
  recommendation: string;
  source?: string;
  affectedVersions?: string[];
  historicalScore: number;
  affectedVersionScore: number;
  maintenanceConcern?: string;
}

function parseVersionParts(value: string): [number, number, number] | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  if (!pa || !pb) return 0;
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  if (pa[1] !== pb[1]) return pa[1] - pb[1];
  return pa[2] - pb[2];
}

function matchesComparator(version: string, rule: string): boolean {
  const trimmed = rule.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(">=")) return compareVersions(version, trimmed.slice(2)) >= 0;
  if (trimmed.startsWith("<=")) return compareVersions(version, trimmed.slice(2)) <= 0;
  if (trimmed.startsWith(">")) return compareVersions(version, trimmed.slice(1)) > 0;
  if (trimmed.startsWith("<")) return compareVersions(version, trimmed.slice(1)) < 0;
  return compareVersions(version, trimmed) === 0;
}

export function isIncidentVersionAffected(version: string, incident: KnownIncident): boolean {
  if (!incident.affectedVersions?.length) return false;
  return incident.affectedVersions.some((rule) => matchesComparator(version, rule));
}

export const KNOWN_INCIDENTS: Record<string, KnownIncident> = {
  colors: {
    incidentType: "maintainer_sabotage",
    confidence: "confirmed",
    summary:
      "Author intentionally introduced an infinite loop during January 2022 releases, breaking installs and runtime behavior.",
    affectedVersions: ["1.4.1", "1.4.2"],
    recommendation: "Pin to 1.4.0 or migrate to chalk/picocolors for actively maintained color utilities.",
    source: "https://github.com/Marak/colors.js/issues/285",
    historicalScore: 24,
    affectedVersionScore: 48,
    maintenanceConcern: "No stable successor release has replaced 1.4.0 after the 2022 sabotage incident."
  },
  faker: {
    incidentType: "maintainer_sabotage",
    confidence: "confirmed",
    summary:
      "The original faker package line published a deliberately corrupted 6.6.6 release during the same 2022 sabotage incident.",
    affectedVersions: ["6.6.6"],
    recommendation: "Use @faker-js/faker (community fork) and avoid the abandoned original line.",
    source: "https://github.com/Marak/faker.js/issues/1046",
    historicalScore: 20,
    affectedVersionScore: 42,
    maintenanceConcern: "Original package stewardship effectively ended; community fork is now the safer path."
  },
  "event-stream": {
    incidentType: "supply_chain_compromise",
    confidence: "confirmed",
    summary:
      "A malicious maintainer update introduced flatmap-stream malware targeting cryptocurrency wallets in the dependency chain.",
    affectedVersions: ["3.3.6"],
    recommendation:
      "Avoid compromised versions, audit dependency trees, and prefer maintained safe lines with lockfile pinning.",
    source: "https://github.com/dominictarr/event-stream/issues/116",
    historicalScore: 80,
    affectedVersionScore: 92
  },
  "ua-parser-js": {
    incidentType: "account_hijack",
    confidence: "confirmed",
    summary:
      "Maintainer account compromise in 2021 published malicious npm releases containing credential-stealing payloads.",
    affectedVersions: ["0.7.29", "0.8.0", "1.0.0"],
    recommendation: "Use >=0.7.30 or >=1.0.1 and confirm lockfile integrity across CI.",
    source: "https://github.com/advisories/GHSA-pjwm-rvh2-c87w",
    historicalScore: 44,
    affectedVersionScore: 68
  },
  "node-ipc": {
    incidentType: "maintainer_sabotage",
    confidence: "confirmed",
    summary:
      "Maintainer introduced destructive protestware logic in 2022 versions that modified files on targeted systems.",
    affectedVersions: ["10.1.1", "10.1.2"],
    recommendation: "Pin to known-safe releases (for example 9.2.2) or migrate to alternatives.",
    source: "https://github.com/RIAEvangelist/node-ipc/issues/233",
    historicalScore: 46,
    affectedVersionScore: 66
  },
  lodash: {
    incidentType: "historical_vulnerability",
    confidence: "high",
    summary:
      "Historical prototype pollution issues affected older lodash releases and were patched in maintained versions.",
    affectedVersions: ["<4.17.21"],
    recommendation: "Use 4.17.21 or newer and keep dependency updates automated.",
    source: "https://github.com/advisories/GHSA-p6mc-m468-83gw",
    historicalScore: 4,
    affectedVersionScore: 18
  }
};
