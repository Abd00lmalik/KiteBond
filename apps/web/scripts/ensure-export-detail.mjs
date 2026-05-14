import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const nextDir = join(process.cwd(), ".next");
const exportDetailPath = join(nextDir, "export-detail.json");
const exportMarkerPath = join(nextDir, "export-marker.json");

if (!existsSync(nextDir)) {
  process.exit(0);
}

if (existsSync(exportDetailPath)) {
  process.exit(0);
}

let payload = {
  version: 1,
  exported: false,
  reason: "Generated for Vercel packaging compatibility when Next.js does not emit export-detail.json."
};

if (existsSync(exportMarkerPath)) {
  try {
    const marker = JSON.parse(readFileSync(exportMarkerPath, "utf8"));
    payload = {
      ...payload,
      marker
    };
  } catch {
    // Keep minimal payload if marker is unreadable.
  }
}

writeFileSync(exportDetailPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log("[build] Wrote .next/export-detail.json compatibility file");
