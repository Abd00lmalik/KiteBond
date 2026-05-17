"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app/AppShell";
import { PageGlow } from "@/components/shared/PageGlow";
import { safeFetch } from "@/lib/safeFetch";
import { formatUsdt } from "@/lib/utils";

type Hunt = {
  id: string;
  chainHuntId: number | null;
  onChainId?: number | null;
  packageName: string;
  version: string;
  rewardAmount: string;
  stakeRequired: string;
  deadline: string;
  status: string;
  submissions: { id: string }[];
  _count?: { submissions: number };
};

function normalizeStatus(hunt: Hunt) {
  if (hunt.status.toLowerCase() === "open" && new Date(hunt.deadline).getTime() < Date.now()) return "Expired";
  if (hunt.status.toLowerCase() === "settled") return "Closed";
  return hunt.status;
}

function statusClasses(status: string) {
  const normalized = status.replace(/\s+/g, "").toLowerCase();
  if (normalized === "open") return "border-[var(--border-orange)] bg-[var(--orange-dim)] text-brand-orange";
  if (normalized === "inreview") return "border-[var(--cyber-yellow)] bg-[rgba(255,214,10,0.08)] text-[var(--cyber-yellow)]";
  if (normalized === "settled" || normalized === "closed") return "border-[var(--cyber-green)] bg-[var(--cyber-green-ghost)] text-[var(--cyber-green)]";
  return "border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--text-secondary)]";
}

export default function MyHuntsPage() {
  const { address, isConnected } = useAccount();
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHunts = useCallback(async () => {
    if (!address) {
      setHunts([]);
      return;
    }

    setLoading(true);
    try {
      const json = await safeFetch<{ data?: Hunt[] }>(`/api/hunts?creator=${encodeURIComponent(address)}`, { cache: "no-store" });
      setHunts(json.data || []);
    } catch {
      setHunts([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void loadHunts();
  }, [loadHunts]);

  function submissionCount(hunt: Hunt) {
    return hunt._count?.submissions ?? hunt.submissions.length;
  }

  function chainLabel(hunt: Hunt) {
    const chainId = hunt.onChainId ?? hunt.chainHuntId;
    return chainId === null || chainId === undefined ? `Record ${hunt.id.slice(0, 8)}` : `Chain Hunt #${chainId}`;
  }

  return (
    <AppShell>
      <PageGlow color="orange" position="top-center" />
      <div className="card card--orange p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label text-brand-orange">My Hunts</p>
            <h1 className="mt-2 text-3xl">Created Hunts</h1>
            <p className="mt-3">Hunts where the connected wallet is the creator.</p>
          </div>
          {isConnected && (
            <button type="button" onClick={loadHunts} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div className="card p-6">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">Connect your wallet to view your hunts.</p>
          <ConnectButton />
        </div>
      ) : (
        <div className="grid gap-4">
          {hunts.map((hunt) => (
            <Link key={hunt.id} href={`/app/hunts/${hunt.id}`} className="card border-l-2 border-l-[var(--brand-orange)] p-5 transition hover:border-[var(--border-orange)] hover:bg-[rgba(249,115,22,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xl font-semibold text-[var(--text-primary)]">{hunt.packageName}@{hunt.version}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(normalizeStatus(hunt))}`}>
                      {normalizeStatus(hunt)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="label">Reward</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{formatUsdt(hunt.rewardAmount)}</p>
                    </div>
                    <div>
                      <p className="label">Required Stake</p>
                      <p className="mt-1 text-lg font-semibold text-brand-orange">{formatUsdt(hunt.stakeRequired)}</p>
                    </div>
                    <div>
                      <p className="label">Submissions</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{submissionCount(hunt)}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-[var(--text-muted)]">Deadline: {new Date(hunt.deadline).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-3 text-right">
                  <span className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-orange)] bg-[var(--orange-dim)] px-3 py-2 text-sm font-semibold text-brand-orange">
                    View
                    <ArrowRight className="h-4 w-4 text-brand-orange" />
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{chainLabel(hunt)}</span>
                </div>
              </div>
            </Link>
          ))}
          {hunts.length === 0 && (
            <div className="card p-8 text-center">
              <p>No hunts created yet.</p>
              <Link href="/app/hunts" className="mt-4 inline-flex text-brand-orange">Create a Hunt</Link>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
