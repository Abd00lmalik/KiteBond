"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Trophy } from "lucide-react";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app/AppShell";
import { PageGlow } from "@/components/shared/PageGlow";
import { TxLink } from "@/components/shared/TxLink";
import { safeFetch } from "@/lib/safeFetch";
import { formatUsdt, truncateHash } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type EvidenceItem = {
  type?: string;
  description?: string;
  source?: string;
  location?: string;
  evidence?: string;
};

type Signal = {
  type?: string;
  severity?: string;
  source?: string;
  location?: string;
  evidence?: string;
  recommendation?: string;
};

type ReportJson = {
  summary?: string;
  riskLevel?: string;
  riskScore?: number;
  confidence?: number;
  finalRecommendation?: string;
  signals?: Signal[];
  evidence?: EvidenceItem[];
};

type Submission = {
  id: string;
  agentAddress: string;
  status: string;
  submittedAt: string;
  reportJson: ReportJson | null;
  verifierResult: boolean | null;
  settlementTx: string | null;
};

type Hunt = {
  id: string;
  chainHuntId: number | null;
  onChainId?: number | null;
  creatorAddress: string;
  packageName: string;
  version: string;
  scanDepth: string;
  rewardAmount: string;
  stakeRequired: string;
  deadline: string;
  status: string;
  termsHash: string | null;
  metadataHash: string | null;
  createdTx: string | null;
  winnerAddress: string | null;
  settlementTx: string | null;
  submissions: Submission[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusFor(hunt: Hunt) {
  if (hunt.status.toLowerCase() === "open" && new Date(hunt.deadline).getTime() < Date.now()) return "Expired";
  if (hunt.status.toLowerCase() === "settled") return "Settled";
  return hunt.status;
}

function chainLabel(hunt: Hunt) {
  const chainId = hunt.onChainId ?? hunt.chainHuntId;
  return chainId === null || chainId === undefined ? `Record ${hunt.id.slice(0, 8)}` : `Chain Hunt #${chainId}`;
}

function severityColor(s?: string) {
  const v = (s || "").toLowerCase();
  if (v === "critical") return "bg-red-900/40 text-red-400 border-red-700";
  if (v === "high") return "bg-[rgba(249,115,22,0.15)] text-brand-orange border-[var(--border-orange)]";
  if (v === "medium") return "bg-yellow-900/30 text-yellow-400 border-yellow-700";
  return "bg-[var(--surface-1)] text-[var(--text-secondary)] border-[var(--border-default)]";
}

function confidenceColor(c?: number) {
  if (!c) return "text-[var(--text-muted)]";
  if (c >= 0.8) return "text-[var(--cyber-green)]";
  if (c >= 0.6) return "text-yellow-400";
  return "text-[var(--text-secondary)]";
}

function riskLabel(riskLevel?: string, riskScore?: number) {
  if (!riskLevel) return null;
  return `${riskLevel.toUpperCase()}${riskScore !== undefined ? ` (${riskScore}/100)` : ""}`;
}

// ─── Evidence renderer ───────────────────────────────────────────────────────

function EvidenceList({ signals, evidence }: { signals?: Signal[]; evidence?: EvidenceItem[] }) {
  const items: EvidenceItem[] = signals?.length ? signals : (evidence ?? []);
  if (!items.length) return <p className="text-xs text-[var(--text-muted)]">No evidence items recorded.</p>;

  return (
    <ul className="mt-2 space-y-2">
      {items.map((item, i) => {
        const typeLabel = item.type?.replace(/_/g, " ") ?? "signal";
        const text = item.evidence ?? item.description ?? "";
        const src = item.source;
        const loc = item.location;
        return (
          <li key={i} className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-glass)] p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{typeLabel}</p>
            {text && <p className="text-[var(--text-secondary)]">{text}</p>}
            {src && (
              <a href={src} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--blue)] underline">
                <ExternalLink className="h-3 w-3" />
                Source
              </a>
            )}
            {loc && (
              <code className="mt-1 block text-xs text-[var(--text-muted)]">{loc}</code>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Submission card ─────────────────────────────────────────────────────────

function SubmissionCard({
  submission,
  huntStatus,
  winnerAddress,
  onSelectWinner,
  isSelecting,
}: {
  submission: Submission;
  huntStatus: string;
  winnerAddress: string | null;
  onSelectWinner: (id: string) => void;
  isSelecting: boolean;
}) {
  const report = submission.reportJson as ReportJson | null;
  const isWinner = submission.status.toLowerCase() === "winner" ||
    (winnerAddress && submission.agentAddress.toLowerCase() === winnerAddress.toLowerCase());
  const huntSettled = huntStatus.toLowerCase() === "settled";
  const canSelectWinner = !huntSettled && !winnerAddress;

  return (
    <article
      className={`rounded-[var(--radius-lg)] border p-5 transition ${
        isWinner
          ? "border-[var(--cyber-green)] bg-[var(--cyber-green-ghost)]"
          : "border-[var(--border-default)] bg-[var(--bg-glass)]"
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">
            Agent: {truncateHash(submission.agentAddress, 10, 6)}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Submitted: {new Date(submission.submittedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Severity badge */}
          {report?.riskLevel && (
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${severityColor(report.riskLevel)}`}>
              {report.riskLevel.toUpperCase()}
            </span>
          )}
          {/* Confidence */}
          {report?.confidence !== undefined && (
            <span className={`text-xs font-semibold ${confidenceColor(report.confidence)}`}>
              {Math.round(report.confidence * 100)}% confidence
            </span>
          )}
          {/* Status */}
          {isWinner ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cyber-green)] bg-[var(--cyber-green-ghost)] px-3 py-1 text-xs font-bold text-[var(--cyber-green)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              ✓ Selected Winner
            </span>
          ) : huntSettled ? (
            <span className="rounded-full border border-[var(--border-default)] bg-[var(--surface-1)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
              Not Selected
            </span>
          ) : (
            <span className="rounded-full border border-[var(--border-default)] bg-[var(--surface-1)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]">
              {submission.status}
            </span>
          )}
        </div>
      </div>

      {/* Risk label */}
      {riskLabel(report?.riskLevel, report?.riskScore) && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Risk: <span className="font-semibold text-[var(--text-secondary)]">{riskLabel(report?.riskLevel, report?.riskScore)}</span>
        </p>
      )}

      {/* Summary */}
      {report?.summary && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Summary</p>
          <p className="mt-1 text-sm text-[var(--text-primary)]">{report.summary}</p>
        </div>
      )}

      {/* Evidence */}
      {(report?.signals?.length || report?.evidence?.length) ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Evidence</p>
          <EvidenceList signals={report?.signals} evidence={report?.evidence} />
        </div>
      ) : null}

      {/* Recommendation */}
      {report?.finalRecommendation && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Recommendation:{" "}
          <span className="font-semibold text-[var(--text-secondary)]">
            {report.finalRecommendation.replace(/_/g, " ")}
          </span>
        </p>
      )}

      {/* On-chain tx links */}
      {submission.settlementTx && (
        <div className="mt-3">
          <TxLink hash={submission.settlementTx} />
        </div>
      )}

      {/* Actions */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {canSelectWinner && !isWinner && (
          <button
            type="button"
            onClick={() => onSelectWinner(submission.id)}
            disabled={isSelecting}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-brand-orange px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
          >
            {isSelecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            Select Winner
          </button>
        )}
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyHuntDetailPage() {
  const params = useParams<{ id: string }>();
  const { address, isConnected } = useAccount();
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  // Creator fetch — sends x-wallet-address to get full submission data
  const loadHunt = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const json = await safeFetch<{ data?: Hunt }>(`/api/hunts/${params.id}`, {
        cache: "no-store",
        headers: { "x-wallet-address": address }
      });
      if (!json.data) throw new Error("Hunt not found");
      setHunt(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load hunt.");
      setHunt(null);
    } finally {
      setLoading(false);
    }
  }, [params.id, address]);

  useEffect(() => {
    void loadHunt();
  }, [loadHunt]);

  const ownsHunt = Boolean(address && hunt?.creatorAddress.toLowerCase() === address.toLowerCase());

  async function selectWinner(submissionId: string) {
    if (!hunt || !address) return;
    setSelectingId(submissionId);
    try {
      const res = await safeFetch<{ success?: boolean; onChain?: boolean; txHash?: string; note?: string }>(
        `/api/hunts/${hunt.id}/select-winner`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": address
          },
          body: JSON.stringify({ submissionId })
        }
      );
      if (res.onChain && res.txHash) {
        toast.success(`Winner selected. On-chain tx: ${truncateHash(res.txHash, 8, 6)}`);
      } else {
        toast.success("Winner marked in database.");
      }
      await loadHunt();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Winner selection failed.");
    } finally {
      setSelectingId(null);
    }
  }

  if (!isConnected) {
    return (
      <AppShell>
        <div className="card p-6">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">Connect the creator wallet to view this hunt.</p>
          <ConnectButton />
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div className="card p-8">
          <Loader2 className="h-5 w-5 animate-spin text-brand-orange" />
        </div>
      </AppShell>
    );
  }

  if (!hunt || !ownsHunt) {
    return (
      <AppShell>
        <div className="card p-8">
          <p>This hunt was not found for the connected wallet.</p>
          <Link href="/app/my-hunts" className="mt-4 inline-flex text-brand-orange">← Back to My Hunts</Link>
        </div>
      </AppShell>
    );
  }

  const isSettled = hunt.status.toLowerCase() === "settled";
  const hasWinner = Boolean(hunt.winnerAddress);

  return (
    <AppShell>
      <PageGlow color="orange" position="top-center" />
      <Link href="/app/my-hunts" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-orange">
        <ArrowLeft className="h-4 w-4" />
        Back to My Hunts
      </Link>

      {/* Hunt header */}
      <div className="card card--orange p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label text-brand-orange">{chainLabel(hunt)}</p>
            <h1 className="mt-2 text-3xl">{hunt.packageName}@{hunt.version}</h1>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">Creator review panel — full submission reports visible to creator wallet only.</p>
          </div>
          <span className="rounded-full border border-[var(--border-orange)] bg-[var(--orange-dim)] px-3 py-1 text-xs font-semibold text-brand-orange">
            {statusFor(hunt)}
          </span>
        </div>
        <div className="mt-5 grid gap-4 text-sm md:grid-cols-4">
          <Info label="Reward" value={formatUsdt(hunt.rewardAmount)} />
          <Info label="Required Stake" value={formatUsdt(hunt.stakeRequired)} />
          <Info label="Deadline" value={new Date(hunt.deadline).toLocaleString()} />
          <Info label="Submissions" value={String(hunt.submissions.length)} />
        </div>
        <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <Info label="Creator" value={truncateHash(hunt.creatorAddress, 8, 6)} />
          <Info label="Scan Depth" value={hunt.scanDepth} />
          <Info
            label="Winner"
            value={hunt.winnerAddress ? truncateHash(hunt.winnerAddress, 8, 6) : "Not selected"}
          />
        </div>
        {hunt.settlementTx && (
          <div className="mt-4">
            <p className="label">Settlement Tx</p>
            <div className="mt-1"><TxLink hash={hunt.settlementTx} /></div>
          </div>
        )}
      </div>

      {/* Winner selection note if DB-only */}
      {isSettled && (
        <div className="rounded-[var(--radius-md)] border border-[var(--cyber-green)] bg-[var(--cyber-green-ghost)] p-4 text-sm">
          <p className="font-semibold text-[var(--cyber-green)]">✓ Hunt Settled</p>
          {!hunt.settlementTx && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Winner has been recorded in the database. On-chain reward distribution is handled separately via the KiteBond contract.
              Contact the creator to arrange reward transfer if not yet settled on-chain.
            </p>
          )}
        </div>
      )}

      {/* Submissions */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <p className="label text-brand-orange">Submissions ({hunt.submissions.length})</p>
          {hasWinner && !isSettled && (
            <span className="text-xs text-[var(--text-muted)]">Winner selected — hunt will settle on-chain</span>
          )}
        </div>

        <div className="mt-5 space-y-5">
          {hunt.submissions.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No submissions have been received for this hunt yet. Agents discover hunts via{" "}
              <Link href="/skill.md" className="text-brand-orange">skill.md</Link>.
            </p>
          ) : (
            hunt.submissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                huntStatus={hunt.status}
                winnerAddress={hunt.winnerAddress}
                onSelectWinner={selectWinner}
                isSelecting={selectingId === submission.id}
              />
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mt-1 text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
