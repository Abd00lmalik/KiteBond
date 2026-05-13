"use client";

import type { ScanState } from "@/lib/scanStateMachine";

type StepStatus = "pending" | "active" | "done" | "failed" | "skipped";

const steps = [
  {
    id: "payment",
    label: "Auth",
    activeStates: ["awaiting_usdt_approval", "approval_confirming", "awaiting_scan_authorization", "authorization_confirming"] as ScanState[]
  },
  { id: "resolve", label: "Resolve", activeStates: ["resolving_package"] as ScanState[] },
  { id: "metadata", label: "Metadata", activeStates: ["inspecting_metadata"] as ScanState[] },
  { id: "signals", label: "Signals", activeStates: ["computing_signals"] as ScanState[] },
  { id: "heurist", label: "Heurist", activeStates: ["heurist_analysis"] as ScanState[] },
  { id: "report", label: "Report", activeStates: ["building_report"] as ScanState[] },
  { id: "receipt", label: "Receipt", activeStates: ["recording_receipt"] as ScanState[] }
];

const stateOrder: ScanState[] = [
  "checking_wallet",
  "checking_network",
  "checking_free_or_price",
  "awaiting_usdt_approval",
  "approval_confirming",
  "awaiting_scan_authorization",
  "authorization_confirming",
  "resolving_package",
  "inspecting_metadata",
  "computing_signals",
  "heurist_analysis",
  "building_report",
  "recording_receipt",
  "completed"
];

const currentLabels: Partial<Record<ScanState, string>> = {
  checking_wallet: "Checking wallet...",
  checking_network: "Checking network...",
  checking_free_or_price: "Checking scan eligibility...",
  awaiting_usdt_approval: "Waiting for USDT approval...",
  approval_confirming: "Confirming approval...",
  awaiting_scan_authorization: "Waiting for authorization...",
  authorization_confirming: "Confirming authorization...",
  resolving_package: "Resolving package...",
  inspecting_metadata: "Inspecting metadata...",
  computing_signals: "Computing risk signals...",
  heurist_analysis: "Heurist AI analyzing...",
  building_report: "Building report...",
  recording_receipt: "Recording scan receipt...",
  completed: "Scan complete."
};

function indexOfState(state: ScanState) {
  return stateOrder.indexOf(state);
}

function getStepStatus(step: (typeof steps)[number], state: ScanState, isFree: boolean): StepStatus {
  if (state === "failed") return "failed";
  if (state === "idle") return "pending";

  const currentIndex = indexOfState(state);
  const activeIndexes = step.activeStates.map(indexOfState);
  const firstActiveIndex = Math.min(...activeIndexes);
  const lastActiveIndex = Math.max(...activeIndexes);

  if (step.id === "payment" && isFree && currentIndex >= indexOfState("resolving_package")) {
    return "skipped";
  }

  if (step.activeStates.includes(state)) return "active";
  if (state === "completed" || currentIndex > lastActiveIndex) return "done";
  if (currentIndex > firstActiveIndex) return "done";
  return "pending";
}

function statusColor(status: StepStatus) {
  if (status === "done") return "var(--green)";
  if (status === "active") return "var(--orange)";
  if (status === "failed") return "var(--red)";
  if (status === "skipped") return "var(--text-muted)";
  return "var(--border-default)";
}

export function CompactScanStatus({ state, error, isFree }: { state: ScanState; error?: string; isFree: boolean }) {
  if (state === "idle") return null;

  const label = state === "failed" ? error || "Scan failed." : currentLabels[state] || state;
  const labelColor = state === "failed" ? "var(--red)" : state === "completed" ? "var(--green)" : "var(--orange)";

  return (
    <div
      style={{
        marginTop: "12px",
        padding: "12px 16px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.75rem"
      }}
    >
      <div style={{ color: labelColor, marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
        {state !== "completed" && state !== "failed" && (
          <span style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }}>●</span>
        )}
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {steps.map((step, index) => {
          const status = getStepStatus(step, state, isFree);
          const color = statusColor(status);
          return (
            <div key={step.id} style={{ display: "contents" }}>
              <div
                title={status === "skipped" ? `${step.label}: free scan, no payment required` : step.label}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: status === "pending" ? "transparent" : color,
                  border: `1px solid ${color}`,
                  flexShrink: 0,
                  transition: "background 0.3s, border-color 0.3s"
                }}
              />
              {index < steps.length - 1 && (
                <div style={{ flex: 1, height: 1, background: "var(--border-void)" }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
        {steps.map((step) => {
          const status = getStepStatus(step, state, isFree);
          const color = statusColor(status);
          return (
            <div
              key={step.id}
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: "0.60rem",
                color,
                overflow: "hidden",
                whiteSpace: "nowrap"
              }}
            >
              {step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
