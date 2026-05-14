export interface KnownIncident {
  severity: "critical" | "high" | "medium" | "low";
  summary: string;
  affectedVersions?: string;
  recommendation: string;
  source?: string;
  maintenanceConcern?: string;
}

export const KNOWN_INCIDENTS: Record<string, KnownIncident> = {
  colors: {
    severity: "medium",
    summary: "Author intentionally introduced an infinite loop in versions 1.4.1-1.4.2 in January 2022.",
    affectedVersions: "1.4.1, 1.4.2",
    recommendation: "Pin to 1.4.0 or migrate to chalk/picocolors.",
    source: "https://github.com/Marak/colors.js/issues/285",
    maintenanceConcern: "No stable release has replaced 1.4.0 since the 2022 incident."
  },
  faker: {
    severity: "medium",
    summary: "Same author released a corrupted 6.6.6 package during the colors incident.",
    affectedVersions: "6.6.6",
    recommendation: "Use @faker-js/faker instead.",
    source: "https://github.com/Marak/faker.js/issues/1046",
    maintenanceConcern: "The original package line was abandoned in favor of the community fork."
  },
  "event-stream": {
    severity: "critical",
    summary: "Malicious code was injected by a new maintainer in 2018 targeting bitcoin wallets.",
    affectedVersions: "3.3.6",
    recommendation: "Audit dependency trees and do not use 3.3.6.",
    source: "https://github.com/dominictarr/event-stream/issues/116"
  },
  "ua-parser-js": {
    severity: "critical",
    summary: "npm account hijack published malicious versions in 2021.",
    affectedVersions: "0.7.29, 0.8.0, 1.0.0",
    recommendation: "Use >= 0.7.30 or >= 1.0.1.",
    source: "https://github.com/advisories/GHSA-pjwm-rvh2-c87w"
  },
  "node-ipc": {
    severity: "critical",
    summary: "Author added a geopolitically motivated destructive payload in 2022.",
    affectedVersions: "10.1.1, 10.1.2",
    recommendation: "Pin to 9.2.2 or use an alternative.",
    source: "https://github.com/RIAEvangelist/node-ipc/issues/233"
  },
  lodash: {
    severity: "low",
    summary: "Prototype pollution vulnerabilities were documented and patched in 4.17.21.",
    affectedVersions: "< 4.17.21",
    recommendation: "Use 4.17.21 or later.",
    source: "https://github.com/advisories/GHSA-p6mc-m468-83gw"
  }
};
