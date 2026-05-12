import type { Severity } from "@/lib/heuristics";

const riskColors: Record<Severity, { bg: string; border: string; text: string }> = {
  low: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", text: "#22c55e" },
  medium: { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.25)", text: "#fbbf24" },
  high: { bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.25)", text: "#fb923c" },
  critical: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "#ef4444" }
};

export function RiskBadge({ level }: { level: Severity | string }) {
  const tone = riskColors[(level as Severity) || "low"] ?? riskColors.low;
  return (
    <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em]" style={{ background: tone.bg, borderColor: tone.border, color: tone.text }}>
      {level}
    </span>
  );
}

export { riskColors };
