"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { PageGlow } from "@/components/shared/PageGlow";
import { TxLink } from "@/components/shared/TxLink";
import { safeFetch } from "@/lib/safeFetch";
import { formatUsdt, truncateHash } from "@/lib/utils";

type Hunt = {
  id: string;
  chainHuntId: number | null;
  packageName: string;
  version: string;
  rewardAmount: string;
  stakeRequired: string;
  deadline: string;
  status: string;
  createdTx: string | null;
  submissions: { id: string }[];
};

const filters = ["All", "Open", "InReview", "Settled"] as const;

export default function HuntsPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Open");
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHunts = useCallback(async (nextFilter = filter) => {
    setLoading(true);
    try {
      const json = await safeFetch<{ data?: Hunt[] }>(`/api/hunts?status=${encodeURIComponent(nextFilter)}`, { cache: "no-store" });
      setHunts(json.data || []);
    } catch {
      setHunts([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadHunts();
  }, [loadHunts]);

  function changeFilter(next: (typeof filters)[number]) {
    setFilter(next);
  }

  return (
    <AppShell
      right={
        <div className="card p-5">
          <p className="label text-brand-orange">Agent Discovery</p>
          <p className="mt-3 text-sm">Open hunts are published through the web app and machine-readable endpoints for external agents.</p>
          <Link href="/skill.md" className="mt-4 inline-flex text-sm font-semibold text-brand-orange">Open skill.md</Link>
        </div>
      }
    >
      <PageGlow color="blue" position="top-right" />
      <div className="card card--orange p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label text-brand-orange">Hunts</p>
            <h1 className="mt-2 text-3xl">Open Hunts</h1>
            <p className="mt-3">Packages escalated to bonded agent investigation.</p>
          </div>
          <button type="button" onClick={() => loadHunts()} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button key={item} type="button" onClick={() => changeFilter(item)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === item ? "border-[var(--border-orange)] bg-[var(--orange-dim)] text-brand-orange" : "border-[var(--border-default)] text-[var(--text-secondary)]"}`}>
            {item === "InReview" ? "In Review" : item}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {hunts.map((hunt) => (
          <Link key={hunt.id} href={`/app/hunts/${hunt.id}`} className="card p-5 transition hover:border-[var(--border-orange)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xl font-semibold text-[var(--text-primary)]">{hunt.packageName}@{hunt.version}</p>
                <p className="mt-2 text-sm">Reward: {formatUsdt(hunt.rewardAmount)} | Stake: {formatUsdt(hunt.stakeRequired)} | Submissions: {hunt.submissions.length}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Deadline: {new Date(hunt.deadline).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <span className="rounded-full border border-[var(--border-orange)] bg-[var(--orange-dim)] px-2.5 py-1 text-xs font-semibold text-brand-orange">{hunt.status}</span>
                <div className="mt-3 flex items-center justify-end gap-3">
                  {hunt.createdTx ? <TxLink hash={hunt.createdTx} /> : <span className="text-xs text-[var(--text-muted)]">{truncateHash(String(hunt.chainHuntId || hunt.id), 8, 4)}</span>}
                  <ArrowRight className="h-4 w-4 text-brand-orange" />
                </div>
              </div>
            </div>
          </Link>
        ))}
        {hunts.length === 0 && (
          <div className="card p-8 text-center">
            <p>No hunts match this filter.</p>
            <Link href="/app/agent-hunt" className="mt-4 inline-flex text-brand-orange">Create a bonded hunt</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
