import { Check, Circle, Trophy, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BadgeTone =
  | "safe"
  | "low"
  | "medium"
  | "warning"
  | "high"
  | "suspicious"
  | "critical"
  | "dangerous"
  | "verified"
  | "invalid"
  | "pending"
  | "slashed"
  | "winner";

const tones: Record<BadgeTone, string> = {
  safe: "border-[var(--cyber-green)] bg-[var(--cyber-green-ghost)] text-[var(--cyber-green)]",
  low: "border-[var(--cyber-green)] bg-[var(--cyber-green-ghost)] text-[var(--cyber-green)]",
  medium: "border-[var(--cyber-yellow)] bg-[rgba(255,214,10,0.08)] text-[var(--cyber-yellow)]",
  warning: "border-[var(--cyber-yellow)] bg-[rgba(255,214,10,0.08)] text-[var(--cyber-yellow)]",
  high: "border-[var(--cyber-yellow)] bg-[rgba(255,214,10,0.08)] text-[var(--cyber-yellow)]",
  suspicious: "border-[var(--cyber-yellow)] bg-[rgba(255,214,10,0.08)] text-[var(--cyber-yellow)]",
  critical: "border-[var(--cyber-red)] bg-[rgba(255,45,85,0.09)] text-[var(--cyber-red)]",
  dangerous: "border-[var(--cyber-red)] bg-[rgba(255,45,85,0.09)] text-[var(--cyber-red)]",
  verified: "border-[var(--cyber-blue)] bg-[var(--cyber-blue-ghost)] text-[var(--cyber-blue)]",
  invalid: "border-[var(--cyber-red)] bg-[rgba(255,45,85,0.09)] text-[var(--cyber-red)]",
  pending: "border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-secondary)]",
  slashed: "border-[var(--cyber-red)] bg-[rgba(255,45,85,0.09)] font-bold text-[var(--cyber-red)]",
  winner: "border-[var(--cyber-green)] bg-[var(--cyber-green)] text-[#030712]"
};

const aliasTones: Record<string, BadgeTone> = {
  open: "pending",
  inprogress: "high",
  in_progress: "high",
  completed: "verified",
  failed: "invalid",
  verifiedvalid: "verified",
  verifiedinvalid: "invalid",
  winner: "winner",
  slashed: "slashed",
  settled: "verified",
  submitted: "pending"
};

export function Badge({
  tone = "pending",
  children,
  label,
  icon,
  className
}: {
  tone?: BadgeTone | string;
  children?: ReactNode;
  label?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const normalized = typeof tone === "string" ? tone.replace(/\s+/g, "").toLowerCase() : "pending";
  const key = (tone in tones ? tone : aliasTones[normalized] || "pending") as BadgeTone;
  const Icon = key === "verified" ? Check : key === "invalid" || key === "slashed" ? X : key === "winner" ? Trophy : key === "pending" ? Circle : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em]", tones[key], className)}>
      {icon || (Icon && <Icon className={cn("h-3 w-3", key === "pending" && "status-pulse rounded-full fill-current")} />)}
      {label || children}
    </span>
  );
}
