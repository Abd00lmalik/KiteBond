"use client";

import { Check, Circle, X } from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/shared/Card";
import { TxLink } from "@/components/shared/TxLink";
import type { ScanState } from "@/lib/scanStateMachine";

type StageStatus = "pending" | "active" | "completed" | "failed";

const stateOrder: ScanState[] = [
  "idle",
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
  "completed",
  "failed"
];

const stages = [
  {
    id: "payment",
    label: "Payment / Authorization",
    states: ["awaiting_usdt_approval", "approval_confirming", "awaiting_scan_authorization", "authorization_confirming"] as ScanState[]
  },
  { id: "resolve", label: "Resolving package", states: ["resolving_package"] as ScanState[] },
  { id: "metadata", label: "Inspecting metadata", states: ["inspecting_metadata"] as ScanState[] },
  { id: "signals", label: "Extracting threat signals", states: ["computing_signals"] as ScanState[] },
  { id: "heurist", label: "Heurist AI analysis", states: ["heurist_analysis"] as ScanState[] },
  { id: "report", label: "Building report", states: ["building_report", "recording_receipt"] as ScanState[] }
];

function stateIndex(state: ScanState) {
  return stateOrder.indexOf(state);
}

function stageStatus(stage: (typeof stages)[number], state: ScanState, isFree: boolean, failedState?: ScanState): StageStatus {
  if (state === "failed") {
    return failedState && stage.states.includes(failedState) ? "failed" : stateIndex(failedState || "idle") > Math.max(...stage.states.map(stateIndex)) ? "completed" : "pending";
  }

  if (stage.states.includes(state)) return "active";
  if (state === "completed") return "completed";

  const current = stateIndex(state);
  const lastStageState = Math.max(...stage.states.map(stateIndex));

  if (stage.id === "payment" && isFree && current >= stateIndex("resolving_package")) {
    return "completed";
  }

  return current > lastStageState ? "completed" : "pending";
}

function stageCopy(stageId: string, status: StageStatus, isFree: boolean) {
  if (stageId === "payment" && isFree && status === "completed") return "Free scan authorized";
  if (status === "active" && stageId === "payment") return "Awaiting wallet confirmation";
  if (status === "failed") return "Stopped";
  return status === "completed" ? "Complete" : "Waiting";
}

function StatusNode({ status, index }: { status: StageStatus; index: number }) {
  if (status === "completed") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-green)] bg-[var(--green-dim)] text-[var(--green)]">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-red)] bg-[var(--red-dim)] text-[var(--red)]">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (status === "active") {
    return (
      <span className="status-pulse flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-orange)] bg-[var(--orange-dim)] text-[var(--orange)]">
        <Circle className="h-3 w-3 fill-current" />
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-dim)] text-xs text-[var(--text-muted)]">
      {index + 1}
    </span>
  );
}

export function ScanPipeline({
  currentState,
  isFree,
  paymentTxHash,
  authTxHash,
  receiptTxHash,
  error,
  failedState
}: {
  currentState: ScanState;
  isFree: boolean;
  paymentTxHash?: string;
  authTxHash?: string;
  receiptTxHash?: string;
  error?: string;
  failedState?: ScanState;
}) {
  return (
    <Card className="p-5">
      <p className="label-sm label-orange">Scan Pipeline</p>
      <div className="mt-5 space-y-0">
        {stages.map((stage, index) => {
          const status = stageStatus(stage, currentState, isFree, failedState);
          const displayStatus = status;
          const connector =
            displayStatus === "completed"
              ? "bg-[var(--green)]"
              : displayStatus === "active"
                ? "bg-[var(--orange)]"
                : displayStatus === "failed"
                  ? "bg-[var(--red)]"
                  : "border-l border-dashed border-[var(--border-dim)]";

          return (
            <motion.div
              key={stage.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              className="grid grid-cols-[28px_1fr] gap-3"
            >
              <div className="flex flex-col items-center">
                <StatusNode status={displayStatus as StageStatus} index={index} />
                {index < stages.length - 1 && <div className={`min-h-7 w-px flex-1 ${connector}`} />}
              </div>
              <div className="pb-5">
                <p
                  className={
                    displayStatus === "active"
                      ? "text-[var(--text-primary)]"
                      : displayStatus === "completed"
                        ? "text-[var(--green)]"
                        : displayStatus === "failed"
                          ? "text-[var(--red)]"
                          : "text-[var(--text-secondary)]"
                  }
                >
                  {stage.label}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{stageCopy(stage.id, displayStatus as StageStatus, isFree)}</p>
                {stage.id === "payment" && authTxHash && <div className="mt-2"><TxLink hash={authTxHash} /></div>}
                {stage.id === "payment" && !authTxHash && paymentTxHash && <div className="mt-2"><TxLink hash={paymentTxHash} /></div>}
                {displayStatus === "failed" && error && <p className="mt-2 text-xs text-[var(--red)]">{error}</p>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}
