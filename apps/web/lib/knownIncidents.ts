import { coerce, satisfies, valid } from "semver";

export interface IncidentVersionSpec {
  range?: string;
  versions?: string[];
}

export interface KnownIncident {
  packageName: string;
  incidentType:
    | "supply_chain_compromise"
    | "maintainer_sabotage"
    | "account_hijack"
    | "historical_vulnerability";
  confidence: "confirmed" | "high" | "medium";
  summary: string;
  recommendation: string;
  source: string;
  reportedAt: string;
  affectedVersions: IncidentVersionSpec;
  severityContribution: number;
  activeSeverityContribution: number;
  maintenanceConcern?: string;
}

export interface IncidentMatch {
  incident: KnownIncident;
  status: "active" | "historical";
  matchedRule: string | null;
}

function normalizeVersion(version: string): string | null {
  const clean = version.trim();
  if (!clean) return null;
  const normalized = valid(clean, { loose: true });
  if (normalized) return normalized;
  return coerce(clean)?.version ?? null;
}

function matchesAffectedVersion(version: string, spec: IncidentVersionSpec): { matched: boolean; rule: string | null } {
  const normalized = normalizeVersion(version);
  if (!normalized) return { matched: false, rule: null };

  const exactVersions = spec.versions ?? [];
  for (const item of exactVersions) {
    const normalizedItem = normalizeVersion(item);
    if (normalizedItem && normalizedItem === normalized) {
      return { matched: true, rule: normalizedItem };
    }
  }

  if (spec.range) {
    try {
      if (satisfies(normalized, spec.range, { includePrerelease: true, loose: true })) {
        return { matched: true, rule: spec.range };
      }
    } catch {
      return { matched: false, rule: null };
    }
  }

  return { matched: false, rule: null };
}

export function isIncidentVersionAffected(version: string, incident: KnownIncident): boolean {
  return matchesAffectedVersion(version, incident.affectedVersions).matched;
}

export function matchKnownIncidents(packageName: string, version: string): IncidentMatch[] {
  const records = KNOWN_INCIDENTS[packageName.trim().toLowerCase()] ?? [];
  return records.map((incident) => {
    const result = matchesAffectedVersion(version, incident.affectedVersions);
    return {
      incident,
      status: result.matched ? "active" : "historical",
      matchedRule: result.rule
    };
  });
}

export const KNOWN_INCIDENTS: Record<string, KnownIncident[]> = {
  colors: [
    {
      packageName: "colors",
      incidentType: "maintainer_sabotage",
      confidence: "confirmed",
      summary:
        "Author intentionally introduced an infinite loop in January 2022 releases, causing denial-of-service behavior.",
      affectedVersions: { versions: ["1.4.1", "1.4.2"] },
      recommendation: "Pin to 1.4.0 or migrate to chalk/picocolors for actively maintained color utilities.",
      source: "https://github.com/Marak/colors.js/issues/285",
      reportedAt: "2022-01-08",
      severityContribution: 24,
      activeSeverityContribution: 52,
      maintenanceConcern: "No stable successor release has replaced 1.4.0 after the 2022 sabotage incident."
    }
  ],
  faker: [
    {
      packageName: "faker",
      incidentType: "maintainer_sabotage",
      confidence: "confirmed",
      summary:
        "The original faker line published a deliberately corrupted 6.6.6 release during the 2022 sabotage incident.",
      affectedVersions: { versions: ["6.6.6"] },
      recommendation: "Use @faker-js/faker (community fork) and avoid the abandoned original package line.",
      source: "https://github.com/Marak/faker.js/issues/1046",
      reportedAt: "2022-01-05",
      severityContribution: 20,
      activeSeverityContribution: 44,
      maintenanceConcern: "Original package stewardship effectively ended; community fork is now the safer path."
    }
  ],
  "event-stream": [
    {
      packageName: "event-stream",
      incidentType: "supply_chain_compromise",
      confidence: "confirmed",
      summary:
        "A malicious maintainer update introduced flatmap-stream malware targeting cryptocurrency wallets in downstream apps.",
      affectedVersions: { versions: ["3.3.6"] },
      recommendation:
        "Avoid compromised versions, audit dependency trees, and pin to known-safe alternatives with lockfile verification.",
      source: "https://github.com/dominictarr/event-stream/issues/116",
      reportedAt: "2018-11-20",
      severityContribution: 80,
      activeSeverityContribution: 96
    }
  ],
  "ua-parser-js": [
    {
      packageName: "ua-parser-js",
      incidentType: "account_hijack",
      confidence: "confirmed",
      summary:
        "Maintainer account compromise in 2021 published malicious npm releases containing credential-stealing payloads.",
      affectedVersions: { versions: ["0.7.29", "0.8.0", "1.0.0"] },
      recommendation: "Use versions >=0.7.30 or >=1.0.1 and verify lockfile integrity across CI.",
      source: "https://github.com/advisories/GHSA-pjwm-rvh2-c87w",
      reportedAt: "2021-10-23",
      severityContribution: 44,
      activeSeverityContribution: 72
    }
  ],
  "node-ipc": [
    {
      packageName: "node-ipc",
      incidentType: "maintainer_sabotage",
      confidence: "confirmed",
      summary:
        "Maintainer introduced protestware logic in 2022 versions that could overwrite files on targeted systems.",
      affectedVersions: { versions: ["10.1.1", "10.1.2"] },
      recommendation: "Pin to known-safe releases (for example 9.2.2) or migrate to safer alternatives.",
      source: "https://github.com/RIAEvangelist/node-ipc/issues/233",
      reportedAt: "2022-03-16",
      severityContribution: 46,
      activeSeverityContribution: 68
    }
  ],
  lodash: [
    {
      packageName: "lodash",
      incidentType: "historical_vulnerability",
      confidence: "high",
      summary:
        "Historical prototype pollution issues affected older lodash releases and were patched in maintained versions.",
      affectedVersions: { range: "<4.17.21" },
      recommendation: "Use 4.17.21 or newer and keep dependency updates automated.",
      source: "https://github.com/advisories/GHSA-p6mc-m468-83gw",
      reportedAt: "2019-07-15",
      severityContribution: 4,
      activeSeverityContribution: 18
    }
  ]
};
