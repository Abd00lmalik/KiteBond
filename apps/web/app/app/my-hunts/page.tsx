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
  packageName: string;
  version: string;
  rewardAmount: string;
  stakeRequired: string;
  deadline: string;
  status: string;
  submissions: { id: string }[];
};

function normalizeStatus(hunt: Hunt) {
  if (hunt.status.toLowerCase() === "open" && new Date(hunt.deadline).getTime() < Date.now()) return "Expired";
  if (hunt.status.toLowerCase() === "settled") return "Closed";
  return hunt.status;
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
          <p className="mb-4 text-sm text-[var(--text-secondary)]">Connect a wallet to see hunts you created.</p>
          <ConnectButton />
        </div>
      ) : (
        <div className="grid gap-4">
          {hunts.map((hunt) => (
            <Link key={hunt.id} href={`/app/my-hunts/${hunt.id}`} className="card p-5 transition hover:border-[var(--border-orange)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-semibold text-[var(--text-primary)]">{hunt.packageName}@{hunt.version}</p>
                  <p className="mt-2 text-sm">
                    Reward: {formatUsdt(hunt.rewardAmount)} | Stake: {formatUsdt(hunt.stakeRequired)} | Submissions: {hunt.submissions.length}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Deadline: {new Date(hunt.deadline).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <span className="rounded-full border border-[var(--border-orange)] bg-[var(--orange-dim)] px-2.5 py-1 text-xs font-semibold text-brand-orange">
                    {normalizeStatus(hunt)}
                  </span>
                  <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--text-muted)]">
                    Hunt #{hunt.chainHuntId ?? hunt.id.slice(0, 8)}
                    <ArrowRight className="h-4 w-4 text-brand-orange" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {hunts.length === 0 && (
            <div className="card p-8 text-center">
              <p>No hunts created by this wallet yet.</p>
              <Link href="/app/agent-hunt" className="mt-4 inline-flex text-brand-orange">Create a bonded hunt</Link>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
