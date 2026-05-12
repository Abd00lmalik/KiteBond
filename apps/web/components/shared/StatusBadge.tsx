import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
  className?: string;
};

const statusTone: Record<string, string> = {
  Created: "border-[var(--border-default)] bg-[var(--bg-glass)] text-[var(--text-secondary)]",
  InProgress: "border-brand-orange/40 bg-brand-orange/10 text-brand-orange",
  Submitted: "border-proof-blue/40 bg-proof-blue/10 text-proof-blue",
  VerifiedPass: "border-proof-green/40 bg-proof-green/10 text-proof-green",
  VerifiedFail: "border-proof-red/40 bg-proof-red/10 text-proof-red",
  Settled: "border-proof-green/40 bg-proof-green/10 text-proof-green",
  Cancelled: "border-[var(--border-default)] bg-[var(--bg-glass)] text-[var(--text-secondary)]",
  Failed: "border-proof-red/40 bg-proof-red/10 text-proof-red"
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold",
        statusTone[status] || statusTone.Created,
        status === "InProgress" && "status-pulse",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
