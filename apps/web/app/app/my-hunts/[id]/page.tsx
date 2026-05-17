"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowLeft, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app/AppShell";
import { PageGlow } from "@/components/shared/PageGlow";
import { FindingsRenderer } from "@/components/hunts/FindingsRenderer";
import { Badge } from "@/components/shared/Badge";
import { safeFetch } from "@/lib/safeFetch";
import { formatUsdt, truncateHash } from "@/lib/utils";

type Submission = {
  id: string;
  agentAddress: string;
  reportJson: unknown;
  status: string;
  submittedAt: string;
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
  submissions: Submission[];
};

function statusFor(hunt: Hunt) {
  if (hunt.status.toLowerCase() === "open" && new Date(hunt.deadline).getTime() < Date.now()) return "Expired";
  if (hunt.status.toLowerCase() === "settled") return "Closed";
  return hunt.status;
}

function chainLabel(hunt: Hunt) {
  const chainId = hunt.onChainId ?? hunt.chainHuntId;
  return chainId === null || chainId === undefined ? `Record ${hunt.id.slice(0, 8)}` : `Chain Hunt #${chainId}`;
}

function submissionTone(status: string) {
  const normalized = status.replace(/\s+/g, "").toLowerCase();
  if (normalized.includes("valid") || normalized === "winner") return "verified";
  if (normalized.includes("invalid") || normalized === "slashed") return "invalid";
  return "pending";
}

export default function MyHuntDetailPage() {
  const params = useParams<{ id: string }>();
  const { address, isConnected } = useAccount();
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHunt = useCallback(async () => {
    setLoading(true);
    try {
      const json = await safeFetch<{ data?: Hunt }>(`/api/hunts/${params.id}`, { cache: "no-store" });
      if (!json.data) throw new Error("Hunt not found");
      setHunt(json.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load hunt.");
      setHunt(null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadHunt();
  }, [loadHunt]);

  const ownsHunt = Boolean(address && hunt?.creatorAddress.toLowerCase() === address.toLowerCase());

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
          <Link href="/app/my-hunts" className="mt-4 inline-flex text-brand-orange">Back to My Hunts</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageGlow color="orange" position="top-center" />
      <Link href="/app/my-hunts" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-orange">
        <ArrowLeft className="h-4 w-4" />
        Back to My Hunts
      </Link>

      <div className="card card--orange p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label text-brand-orange">{chainLabel(hunt)}</p>
            <h1 className="mt-2 text-3xl">{hunt.packageName}@{hunt.version}</h1>
            <p className="mt-3">Full metadata and agent submissions for this creator wallet.</p>
          </div>
          <span className="rounded-full border border-[var(--border-orange)] bg-[var(--orange-dim)] px-3 py-1 text-xs font-semibold text-brand-orange">
            {statusFor(hunt)}
          </span>
        </div>
        <div className="mt-5 grid gap-4 text-sm md:grid-cols-4">
          <Info label="Reward" value={formatUsdt(hunt.rewardAmount)} />
          <Info label="Stake" value={formatUsdt(hunt.stakeRequired)} />
          <Info label="Deadline" value={new Date(hunt.deadline).toLocaleString()} />
          <Info label="Submissions" value={String(hunt.submissions.length)} />
        </div>
        <div className="mt-5 grid gap-4 text-sm md:grid-cols-3">
          <Info label="Creator" value={truncateHash(hunt.creatorAddress, 8, 6)} />
          <Info label="Scan Depth" value={hunt.scanDepth} />
          <Info label="Winner" value={hunt.winnerAddress ? truncateHash(hunt.winnerAddress, 8, 6) : "Not selected"} />
        </div>
      </div>

      <div className="card p-6">
        <p className="label text-brand-orange">Submissions</p>
        <div className="mt-4 space-y-5">
          {hunt.submissions.map((submission) => (
            <article key={submission.id} className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-glass)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">Agent {truncateHash(submission.agentAddress, 8, 6)}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Submitted {new Date(submission.submittedAt).toLocaleString()}</p>
                </div>
                <Badge tone={submissionTone(submission.status)} label={submission.status} />
              </div>
              <div className="mt-4">
                <FindingsRenderer reportJson={submission.reportJson} />
              </div>
            </article>
          ))}
          {hunt.submissions.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No submissions have been received for this hunt yet.</p>}
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
