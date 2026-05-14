"use client";

import type { ReactNode } from "react";
import type { ScanState } from "@/lib/scanStateMachine";

type StepStatus = "pending" | "active" | "done" | "failed" | "skipped";
export type CompactStage = "idle" | "authorizing" | "resolving" | "analyzing" | "anchoring" | "complete" | "error";
export type CompactStepKey = "auth" | "resolve" | "analyze" | "report";

const legacySteps = [
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

const legacyStateOrder: ScanState[] = [
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

const legacyLabels: Partial<Record<ScanState, string>> = {
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

const stageSteps = [
  { key: "auth", label: "Authorization", active: "authorizing" },
  { key: "resolve", label: "Resolve Package", active: "resolving" },
  { key: "analyze", label: "Heurist Analysis", active: "analyzing" },
  { key: "report", label: "Report", active: "anchoring" }
] as const;
const stageOrder = ["auth", "resolve", "analyze", "report", "complete"] as const;

function indexOfLegacyState(state: ScanState) {
  return legacyStateOrder.indexOf(state);
}

function getLegacyStepStatus(step: (typeof legacySteps)[number], state: ScanState, isFree: boolean): StepStatus {
  if (state === "failed") return "failed";
  if (state === "idle") return "pending";

  const currentIndex = indexOfLegacyState(state);
  const activeIndexes = step.activeStates.map(indexOfLegacyState);
  const firstActiveIndex = Math.min(...activeIndexes);
  const lastActiveIndex = Math.max(...activeIndexes);

  if (step.id === "payment" && isFree && currentIndex >= indexOfLegacyState("resolving_package")) {
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

export function CompactScanStatus({
  state,
  stage,
  error,
  isFree,
  failedStep
}: {
  state?: ScanState;
  stage?: CompactStage;
  error?: string;
  isFree: boolean;
  failedStep?: CompactStepKey;
}) {
  if (stage) return <StageScanStatus stage={stage} error={error} failedStep={failedStep} />;
  if (!state || state === "idle") return null;

  const label = state === "failed" ? error || "Scan failed." : legacyLabels[state] || state;
  const labelColor = state === "failed" ? "var(--red)" : state === "completed" ? "var(--green)" : "var(--orange)";

  return (
    <StatusShell label={label} labelColor={labelColor} showPulse={state !== "completed" && state !== "failed"}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {legacySteps.map((step, index) => {
          const status = getLegacyStepStatus(step, state, isFree);
          const color = statusColor(status);
          return (
            <div key={step.id} style={{ display: "contents" }}>
              <StepDot color={color} filled={status !== "pending"} title={status === "skipped" ? `${step.label}: free scan, no payment required` : step.label} />
              {index < legacySteps.length - 1 && <Connector />}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
        {legacySteps.map((step) => {
          const status = getLegacyStepStatus(step, state, isFree);
          return <StepLabel key={step.id} label={step.label} color={statusColor(status)} />;
        })}
      </div>
    </StatusShell>
  );
}

function StageScanStatus({ stage, error, failedStep }: { stage: CompactStage; error?: string; failedStep?: CompactStepKey }) {
  if (stage === "idle") return null;

  const labelMap: Record<CompactStage, string> = {
    idle: "",
    authorizing: "Authorizing scan...",
    resolving: "Resolving npm package...",
    analyzing: "Heurist analysis running...",
    anchoring: "Building report...",
    complete: "Scan complete.",
    error: error || "Scan failed."
  };
  const labelColor = stage === "error" ? "var(--red)" : stage === "complete" ? "var(--green)" : "var(--orange)";

  return (
    <StatusShell label={labelMap[stage]} labelColor={labelColor} showPulse={stage !== "complete" && stage !== "error"}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {stageSteps.map((step, index) => {
          const status = getStageStepStatus(step.key, stage, failedStep);
          const color = status === "failed"
            ? "var(--red)"
            : status === "done"
                ? "var(--green)"
                : status === "active"
                  ? "var(--orange)"
                  : "var(--border-default)";
          return (
            <div key={step.key} style={{ display: "contents" }}>
              <StepDot color={color} filled={status !== "pending"} title={step.label} />
              {index < stageSteps.length - 1 && <Connector />}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
        {stageSteps.map((step) => {
          const status = getStageStepStatus(step.key, stage, failedStep);
          const color =
            status === "failed" ? "var(--red)" : status === "active" ? "var(--orange)" : status === "done" ? "var(--green)" : "var(--text-muted)";
          return <StepLabel key={step.key} label={step.label} color={color} />;
        })}
      </div>
    </StatusShell>
  );
}

function getStageStepStatus(stepKey: CompactStepKey, stage: CompactStage, failedStep?: CompactStepKey): StepStatus {
  if (stage === "idle") return "pending";
  if (stage === "complete") return "done";

  const effectiveFailedStep = failedStep || "auth";
  if (stage === "error") {
    if (stepKey === effectiveFailedStep) return "failed";
    return stageOrder.indexOf(stepKey) < stageOrder.indexOf(effectiveFailedStep) ? "done" : "pending";
  }

  const activeStep = stageSteps.find((step) => step.active === stage)?.key ?? "auth";
  if (stepKey === activeStep) return "active";
  return stageOrder.indexOf(stepKey) < stageOrder.indexOf(activeStep) ? "done" : "pending";
}

function StatusShell({
  label,
  labelColor,
  showPulse,
  children
}: {
  label: string;
  labelColor: string;
  showPulse: boolean;
  children: ReactNode;
}) {
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
        {showPulse && <span style={{ animation: "pulse-dot 1.5s ease-in-out infinite" }}>●</span>}
        {label}
      </div>
      {children}
    </div>
  );
}

function StepDot({ color, filled, title }: { color: string; filled: boolean; title: string }) {
  return (
    <div
      title={title}
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: filled ? color : "transparent",
        border: `1px solid ${color}`,
        flexShrink: 0,
        transition: "background 0.3s, border-color 0.3s"
      }}
    />
  );
}

function Connector() {
  return <div style={{ flex: 1, height: 1, background: "var(--border-void)" }} />;
}

function StepLabel({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        textAlign: "center",
        fontSize: "0.60rem",
        color,
        overflow: "hidden",
        whiteSpace: "nowrap"
      }}
    >
      {label}
    </div>
  );
}
