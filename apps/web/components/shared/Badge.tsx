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
  safe: "border-[var(--border-green)] bg-[var(--green-dim)] text-[var(--text-green)]",
  low: "border-[var(--border-green)] bg-[var(--green-dim)] text-[var(--text-green)]",
  medium: "border-[var(--border-amber)] bg-[var(--amber-dim)] text-[var(--text-amber)]",
  warning: "border-[var(--border-amber)] bg-[var(--amber-dim)] text-[var(--text-amber)]",
  high: "border-[var(--border-orange)] bg-[var(--orange-dim)] text-[var(--text-orange)]",
  suspicious: "border-[var(--border-orange)] bg-[var(--orange-dim)] text-[var(--text-orange)]",
  critical: "border-[var(--border-red)] bg-[var(--red-dim)] text-[var(--text-red)]",
  dangerous: "border-[var(--border-red)] bg-[var(--red-dim)] text-[var(--text-red)]",
  verified: "border-[var(--border-green)] bg-[var(--green)] text-white",
  invalid: "border-[var(--border-red)] bg-[var(--red)] text-white",
  pending: "border-[var(--border-dim)] bg-[var(--bg-glass)] text-[var(--text-muted)]",
  slashed: "border-[var(--border-red)] bg-[var(--red-dim)] font-bold text-[var(--text-red)]",
  winner: "border-[var(--border-orange)] bg-[var(--orange)] text-black"
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
  const key = (tone in tones ? tone : "pending") as BadgeTone;
  const Icon = key === "verified" ? Check : key === "invalid" || key === "slashed" ? X : key === "winner" ? Trophy : key === "pending" ? Circle : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em]", tones[key], className)}>
      {icon || (Icon && <Icon className={cn("h-3 w-3", key === "pending" && "status-pulse rounded-full fill-current")} />)}
      {label || children}
    </span>
  );
}
