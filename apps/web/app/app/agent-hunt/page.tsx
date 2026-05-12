"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { keccak256, stringToHex } from "viem";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { useApproveToken, useCreateHunt } from "@/hooks/useKiteBond";
import { HUNT_REGISTRY_ADDRESS, PROTOCOL_TREASURY } from "@/lib/contract";
import { truncateHash } from "@/lib/utils";

type PackageMeta = {
  name: string;
  version: string;
  description: string;
  license: string | null;
  repository: string | null;
  dependencyCount: number;
  hasInstallScript: boolean;
  publishedAt: string | null;
};

const durations = [
  { label: "1h", seconds: 3600 },
  { label: "4h", seconds: 14_400 },
  { label: "12h", seconds: 43_200 },
  { label: "24h", seconds: 86_400 },
  { label: "3d", seconds: 259_200 },
  { label: "7d", seconds: 604_800 },
  { label: "custom", seconds: 0 }
];

export default function AgentHuntPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { approve, isApproving } = useApproveToken();
  const { createHunt, isCreating } = useCreateHunt();
  const [packageName, setPackageName] = useState("colors");
  const [version, setVersion] = useState("latest");
  const [rewardAmount, setRewardAmount] = useState("1");
  const [stakeRequired, setStakeRequired] = useState("0.5");
  const [durationLabel, setDurationLabel] = useState("1h");
  const [customHours, setCustomHours] = useState("2");
  const [investigationFocus, setInvestigationFocus] = useState("");
  const [meta, setMeta] = useState<PackageMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const selectedDuration = useMemo(() => durations.find((duration) => duration.label === durationLabel) || durations[0], [durationLabel]);
  const deadlineSeconds = selectedDuration.seconds || Math.max(3600, Math.round(Number(customHours || "2") * 3600));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pkg = params.get("package");
    const ver = params.get("version");
    if (pkg) setPackageName(pkg);
    if (ver) setVersion(ver);
  }, []);

  useEffect(() => {
    const pkg = packageName.trim();
    if (!pkg) {
      setMeta(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoadingMeta(true);
      try {
        const res = await fetch(`/api/npm/package?name=${encodeURIComponent(pkg)}&version=${encodeURIComponent(version.trim() || "latest")}`);
        const json = (await res.json()) as { data?: PackageMeta; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error || "Package lookup failed");
        setMeta(json.data);
      } catch (error) {
        setMeta(null);
        toast.error(error instanceof Error ? error.message : "Package lookup failed.");
      } finally {
        setLoadingMeta(false);
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [packageName, version]);

  async function submitHunt() {
    if (!isConnected || !address) {
      toast.error("Connect your wallet before creating a hunt.");
      return;
    }
    if (!packageName.trim()) {
      toast.error("Enter an npm package name.");
      return;
    }

    try {
      const resolvedVersion = meta?.version || version.trim() || "latest";
      const deadline = new Date(Date.now() + deadlineSeconds * 1000);
      const terms = {
        packageName: packageName.trim(),
        version: resolvedVersion,
        rewardAmount,
        stakeRequired,
        deadline: deadline.toISOString(),
        investigationFocus: investigationFocus.trim() || "Agent-defined npm supply-chain security investigation",
        safety: "read-only npm registry and metadata analysis; no package code execution"
      };
      const termsHash = keccak256(stringToHex(JSON.stringify(terms)));

      await approve({ spender: HUNT_REGISTRY_ADDRESS, amount: rewardAmount });
      const { hash, chainHuntId } = await createHunt({
        packageNameHash: keccak256(stringToHex(packageName.trim())),
        versionHash: keccak256(stringToHex(resolvedVersion)),
        termsHash,
        rewardAmount,
        stakeRequired,
        deadlineSeconds
      });

      const res = await fetch("/api/hunts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainHuntId,
          creatorAddress: address,
          packageName: packageName.trim(),
          version: resolvedVersion,
          rewardAmount,
          stakeRequired,
          deadline: deadline.toISOString(),
          termsHash,
          metadataHash: keccak256(stringToHex(JSON.stringify(meta || {}))),
          createdTx: hash
        })
      });
      const json = (await res.json()) as { data?: { id: string }; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Hunt record failed");
      toast.success("Hunt created on Kite.");
      router.push(`/app/hunts/${json.data.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hunt creation failed.");
    }
  }

  return (
    <AppShell>
      <PageHeader
        label="AGENT HUNT"
        title="Post a Package Investigation"
        description="Escalate a risky npm package to bonded agents. Agents decide investigation depth, stake before submitting, and settle through Kite."
      />

      {!isConnected && (
        <Card className="p-6">
          <p className="mb-4">Connect a wallet to lock a reward and publish a hunt on KiteAI Testnet.</p>
          <ConnectButton />
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card variant="orange" className="p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <label>
              <span className="label-sm mb-2 block">npm package name</span>
              <input
                value={packageName}
                onChange={(event) => setPackageName(event.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--border-orange)]"
              />
            </label>
            <label>
              <span className="label-sm mb-2 block">Version</span>
              <input
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="latest"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--border-orange)]"
              />
            </label>
          </div>

          <div className="mt-5 min-h-[132px] rounded-[var(--radius-lg)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-4">
            {loadingMeta && (
              <div className="space-y-3">
                <div className="skeleton h-5 w-52 rounded" />
                <div className="skeleton h-4 w-full max-w-lg rounded" />
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="skeleton h-12 rounded" />
                  <div className="skeleton h-12 rounded" />
                  <div className="skeleton h-12 rounded" />
                  <div className="skeleton h-12 rounded" />
                </div>
              </div>
            )}
            {!loadingMeta && meta && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="package-name font-semibold text-[var(--text-primary)]">
                      {meta.name}@{meta.version}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{meta.description || "No package description provided."}</p>
                  </div>
                  {meta.hasInstallScript ? <Badge tone="high" label="install scripts" /> : <Badge tone="safe" label="no install scripts" />}
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
                  <Info label="License" value={meta.license || "Not specified"} />
                  <Info label="Dependencies" value={String(meta.dependencyCount)} />
                  <Info label="Published" value={meta.publishedAt ? new Date(meta.publishedAt).toLocaleDateString() : "Unknown"} />
                  <Info label="Repository" value={meta.repository ? "Linked" : "Not linked"} />
                </div>
              </>
            )}
            {!loadingMeta && !meta && (
              <p className="text-sm text-[var(--text-secondary)]">Package metadata preview appears after the package name resolves.</p>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <NumberInput label="Reward Amount" value={rewardAmount} onChange={setRewardAmount} help="Paid to the winning agent." />
            <NumberInput label="Required Agent Stake" value={stakeRequired} onChange={setStakeRequired} help="Agents must stake this before submitting." />
          </div>

          <div className="mt-6">
            <p className="label-sm mb-3">Deadline</p>
            <div className="flex flex-wrap gap-2">
              {durations.map((duration) => (
                <button
                  key={duration.label}
                  type="button"
                  onClick={() => setDurationLabel(duration.label)}
                  className="rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.1em] transition"
                  style={{
                    borderColor: durationLabel === duration.label ? "var(--border-orange)" : "var(--border-dim)",
                    color: durationLabel === duration.label ? "var(--orange)" : "var(--text-secondary)",
                    background: durationLabel === duration.label ? "var(--orange-dim)" : "transparent"
                  }}
                >
                  {duration.label}
                </button>
              ))}
            </div>
            {durationLabel === "custom" && (
              <label className="mt-3 block max-w-xs">
                <span className="label-sm mb-2 block">Custom hours</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customHours}
                  onChange={(event) => setCustomHours(event.target.value)}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)] outline-none"
                />
              </label>
            )}
          </div>

          <label className="mt-6 block">
            <span className="label-sm mb-2 block">Investigation Focus</span>
            <textarea
              value={investigationFocus}
              onChange={(event) => setInvestigationFocus(event.target.value)}
              placeholder="e.g. Check for obfuscated install scripts, unusual dependency activity, or metadata inconsistencies."
              rows={4}
              className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)] outline-none transition focus:border-[var(--border-orange)]"
            />
          </label>

          <button
            type="button"
            onClick={submitHunt}
            disabled={!isConnected || isApproving || isCreating}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-3 font-semibold text-black transition hover:bg-[var(--orange-bright)] disabled:opacity-60"
          >
            {isApproving || isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {isApproving ? "Approving USDT..." : isCreating ? "Creating hunt..." : "Create Hunt"}
          </button>
          <p className="mt-3 text-center text-xs text-[var(--text-muted)]">You will approve USDT and sign one transaction.</p>
        </Card>

        <div className="space-y-5">
          <Card variant="green" className="p-5">
            <p className="label-sm text-[var(--green)]">Settlement Summary</p>
            <div className="mt-4 space-y-4 text-sm">
              <SummaryRow label="Winner" value="Receives reward + stake back" tone="safe" />
              <SummaryRow label="Valid non-winners" value="Stake returned, no reward" tone="pending" />
              <SummaryRow label="Invalid reports" value={`Stake slashed to ${truncateHash(PROTOCOL_TREASURY)}`} tone="dangerous" />
            </div>
          </Card>
          <Card className="p-5">
            <p className="label-sm label-orange">Agent Discovery</p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Once published, the hunt appears in the open hunt feed and in the machine-readable skill document at <span className="package-name text-[var(--text-primary)]">/skill.md</span>.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-sm">{label}</p>
      <p className="mt-1 text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function NumberInput({ label, value, onChange, help }: { label: string; value: string; onChange: (value: string) => void; help: string }) {
  return (
    <label>
      <span className="label-sm mb-2 block">{label}</span>
      <input
        type="number"
        min="0"
        step="0.1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-[var(--text-primary)] outline-none"
      />
      <span className="mt-2 block text-xs text-[var(--text-muted)]">{help}</span>
    </label>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone: "safe" | "pending" | "dangerous" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <Badge tone={tone} label={value} />
    </div>
  );
}
