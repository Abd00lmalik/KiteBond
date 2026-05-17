"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CheckCircle2, Loader2, Shield } from "lucide-react";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app/AppShell";
import { PageGlow } from "@/components/shared/PageGlow";
import { TxLink } from "@/components/shared/TxLink";
import { Badge } from "@/components/shared/Badge";
import { useHuntPreflight } from "@/hooks/useHuntPreflight";
import { useApproveToken, useStakeAndJoin, useSubmitReportOnChain } from "@/hooks/useKiteBond";
import { getHuntRegistryAddress, getMissingContractConfig } from "@/lib/contractConfig";
import { ApiError, safeFetch } from "@/lib/safeFetch";
import { formatUsdt, truncateHash } from "@/lib/utils";

// Public submission shape — reportJson is NEVER returned to non-creator callers
type PublicSubmission = {
  id: string;
  agentAddress: string;
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
  rewardAmount: string;
  stakeRequired: string;
  deadline: string;
  status: string;
  termsHash: string | null;
  createdTx: string | null;
  winnerAddress: string | null;
  settlementTx: string | null;
  submissionsCount?: number;
  submissions: PublicSubmission[];
};

function submissionTone(status: string) {
  const normalized = status.replace(/\s+/g, "").toLowerCase();
  if (normalized.includes("valid") || normalized === "winner") return "verified";
  if (normalized.includes("invalid") || normalized === "slashed") return "invalid";
  return "pending";
}

function chainLabel(hunt: Hunt) {
  const chainId = hunt.onChainId ?? hunt.chainHuntId;
  return chainId === null || chainId === undefined ? `Record ${hunt.id.slice(0, 8)}` : `Chain Hunt #${chainId}`;
}

export default function HuntDetailPage() {
  const params = useParams<{ id: string }>();
  const { address, isConnected } = useAccount();
  const { approve, isApproving } = useApproveToken();
  const { stakeAndJoin, isStaking } = useStakeAndJoin();
  const { submitReport, isSubmitting } = useSubmitReportOnChain();
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [loading, setLoading] = useState(true);
  const [stakeTx, setStakeTx] = useState<string | null>(null);
  const preflight = useHuntPreflight({ stakeAmount: hunt?.stakeRequired, rewardAmount: hunt?.rewardAmount });
  const missingContracts = getMissingContractConfig();
  const huntSpender = (() => {
    try {
      return getHuntRegistryAddress();
    } catch {
      return null;
    }
  })();

  const isCreator = Boolean(address && hunt?.creatorAddress.toLowerCase() === address.toLowerCase());
  const currentUserSubmission = useMemo(
    () => hunt?.submissions.find((s) => address && s.agentAddress.toLowerCase() === address.toLowerCase()),
    [address, hunt?.submissions]
  );
  const submissionsCount = hunt?.submissionsCount ?? hunt?.submissions.length ?? 0;

  // Public fetch — does NOT send x-wallet-address, so the API returns no report content
  const loadHunt = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    try {
      const json = await safeFetch<{ data?: Hunt }>(`/api/hunts/${params.id}`, { cache: "no-store" });
      if (!json.data) throw new Error("Hunt not found");
      setHunt(json.data);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Hunt load failed.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadHunt();
  }, [loadHunt]);

  async function joinHunt() {
    if (!hunt?.chainHuntId || !address) {
      toast.error("Connect your wallet before joining.");
      return;
    }
    if (!preflight.correctNetwork) {
      toast.error("Switch to KiteAI Testnet before joining.");
      return;
    }
    if (!preflight.contractsConfigured) {
      toast.error(`Contracts not configured: ${missingContracts.join(", ") || "missing deployment env"}`);
      return;
    }
    if (!preflight.hasEnoughUsdtForStake) {
      toast.error(`Insufficient USDT stake balance. Have ${preflight.formattedUsdtBalance} USDT.`);
      return;
    }
    if (!preflight.hasKiteForGas) {
      toast.error("Low KITE for gas. Fund at faucet.gokite.ai.");
      return;
    }
    try {
      await approve({ spender: getHuntRegistryAddress(), amount: hunt.stakeRequired });
      const tx = await stakeAndJoin({ chainHuntId: hunt.chainHuntId });
      setStakeTx(tx);
      toast.success("Stake locked on Kite.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Stake transaction failed.");
    }
  }

  async function submitAgentReport() {
    if (!hunt?.chainHuntId || !address) return;
    const report = {
      huntId: hunt.id,
      agentAddress: address,
      packageName: hunt.packageName,
      version: hunt.version,
      riskScore: 25,
      riskLevel: "medium",
      summary: `${hunt.packageName}@${hunt.version} was reviewed using npm registry metadata and static supply-chain heuristics.`,
      signals: [
        {
          type: "metadata_signal",
          severity: "medium",
          evidence: "Agent report generated from registry metadata and package publication signals.",
          recommendation: "Review maintainer, repository, lifecycle scripts, and dependency posture before adopting the package."
        }
      ],
      finalRecommendation: "use_with_caution",
      confidence: 0.72,
      limitations: ["Browser-generated test report uses registry metadata and does not inspect package tarball contents."],
      metadata: { repository: null, license: null, dependencyCount: 0, hasInstallScripts: false }
    };
    const reportHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(report))) as `0x${string}`;

    try {
      const submitTx = await submitReport({ chainHuntId: hunt.chainHuntId, reportHash });
      const json = await safeFetch<{ data?: unknown }>(`/api/agent/hunts/${hunt.id}/submit-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentAddress: address, stakeTxHash: stakeTx, submitTxHash: submitTx, reportHash, reportJson: report })
      });
      if (!json.data) throw new Error("Report submission failed");
      toast.success("Report submitted for verifier review.");
      await loadHunt();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report submission failed.");
    }
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

  if (!hunt) {
    return (
      <AppShell>
        <div className="card p-8">Hunt not found.</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      right={
        <div className="space-y-5">
          <div className="card p-5">
            <p className="label text-brand-orange">Proof</p>
            <div className="mt-4 space-y-3 text-sm">
              <Info label="Terms Hash" value={hunt.termsHash ? truncateHash(hunt.termsHash, 10, 8) : "Pending"} />
              <Info label="Created Tx" value={hunt.createdTx ? "" : "Pending"} tx={hunt.createdTx} />
              <Info label="Settlement Tx" value={hunt.settlementTx ? "" : "Pending"} tx={hunt.settlementTx} />
              <Info label="Winner" value={hunt.winnerAddress ? truncateHash(hunt.winnerAddress, 8, 6) : "Not selected"} />
            </div>
          </div>
          <div className="card p-5">
            <p className="label text-brand-orange">Agent Action</p>
            {huntSpender && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                <span className="font-mono">Approving stake spender: </span>
                <a
                  href={`https://testnet.kitescan.ai/address/${huntSpender}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[var(--blue)]"
                >
                  {huntSpender.slice(0, 8)}...{huntSpender.slice(-6)}
                </a>
              </p>
            )}
            {!preflight.contractsConfigured && (
              <p className="mt-2 text-xs text-[var(--amber)]">
                Missing contract config: {missingContracts.join(", ")}
              </p>
            )}
            {!isConnected ? (
              <div className="mt-4"><ConnectButton /></div>
            ) : isCreator ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-[var(--text-secondary)]">You are the hunt creator.</p>
                <Link
                  href={`/app/my-hunts/${hunt.id}`}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-brand-orange px-4 py-2 text-sm font-semibold text-black"
                >
                  Review Submissions →
                </Link>
              </div>
            ) : currentUserSubmission ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm">Your submission status:</p>
                <Badge tone={submissionTone(currentUserSubmission.status)} label={currentUserSubmission.status} />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={joinHunt}
                  disabled={isApproving || isStaking || !preflight.correctNetwork || !preflight.contractsConfigured || !preflight.hasEnoughUsdtForStake || !preflight.hasKiteForGas}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-brand-orange px-4 py-3 font-semibold text-black disabled:opacity-60"
                >
                  {isApproving || isStaking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  {isApproving ? "Approving stake..." : isStaking ? "Joining hunt..." : "Stake & Join"}
                </button>
                <button
                  type="button"
                  onClick={submitAgentReport}
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-orange)] px-4 py-3 font-semibold text-brand-orange disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Submit Agent Report
                </button>
              </div>
            )}
          </div>
        </div>
      }
    >
      <PageGlow color="blue" position="top-right" />
      <div className="card card--orange p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label text-brand-orange">{chainLabel(hunt)}</p>
            <h1 className="mt-2 text-3xl">{hunt.packageName}@{hunt.version}</h1>
            <p className="mt-3">Bonded npm package investigation on KiteAI Testnet.</p>
          </div>
          <span className="rounded-full border border-[var(--border-orange)] bg-[var(--orange-dim)] px-3 py-1 text-xs font-semibold text-brand-orange">
            {hunt.status}
          </span>
        </div>
        <div className="mt-5 grid gap-4 text-sm md:grid-cols-4">
          <Info label="Reward" value={formatUsdt(hunt.rewardAmount)} />
          <Info label="Stake" value={formatUsdt(hunt.stakeRequired)} />
          <Info label="Deadline" value={new Date(hunt.deadline).toLocaleString()} />
          <Info label="Creator" value={truncateHash(hunt.creatorAddress, 8, 6)} />
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <p className="label text-brand-orange">Submissions</p>
          <span className="rounded-full border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            {submissionsCount} {submissionsCount === 1 ? "submission" : "submissions"}
          </span>
        </div>

        {isCreator ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-orange)] bg-[var(--orange-dim)] p-4">
            <p className="text-sm font-semibold text-brand-orange">Creator Review — My Hunts</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Full submission reports are private and only accessible in the My Hunts review panel.
            </p>
            <Link href={`/app/my-hunts/${hunt.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-orange">
              Open Review Panel →
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {hunt.submissions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No submissions yet. Open agents can stake and submit through the UI or{" "}
                <code className="text-xs">/skill.md</code> flow.
              </p>
            ) : (
              <>
                <p className="text-xs text-[var(--text-muted)]">
                  Submission reports are private. Only the hunt creator can view findings.
                </p>
                <div className="space-y-2">
                  {hunt.submissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-glass)] px-4 py-3"
                    >
                      <div>
                        <p className="font-mono text-sm text-[var(--text-secondary)]">
                          {truncateHash(submission.agentAddress, 8, 6)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {new Date(submission.submittedAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge tone={submissionTone(submission.status)} label={submission.status} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Info({ label, value, tx }: { label: string; value: string; tx?: string | null }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="mt-1 text-[var(--text-primary)]">{tx ? <TxLink hash={tx} /> : value}</div>
    </div>
  );
}
