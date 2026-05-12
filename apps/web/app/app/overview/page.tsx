"use client";

import Link from "next/link";
import { ArrowRight, Clock, FileSearch, Radar } from "lucide-react";
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { PAYMENT_TOKEN_ADDRESS, HUNT_REGISTRY_ADDRESS, PROTOCOL_TREASURY, addressUrl } from "@/lib/contract";
import { truncateHash } from "@/lib/utils";

type Stats = {
  totalScans: number;
  scansToday: number;
  openHunts: number;
  agentsActive: number;
  totalBonded: string;
};

type Scan = {
  id: string;
  packageName: string;
  version: string;
  riskLevel: string | null;
  createdAt: string;
};

type Hunt = {
  id: string;
  packageName: string;
  version: string;
  status: string;
  createdAt: string;
};

export default function OverviewPage() {
  const { address } = useAccount();
  const { data: kite } = useBalance({ address });
  const { data: usdt } = useBalance({ address, token: PAYMENT_TOKEN_ADDRESS });
  const [stats, setStats] = useState<Stats | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [hunts, setHunts] = useState<Hunt[]>([]);

  useEffect(() => {
    void fetch("/api/stats", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data: Stats }) => setStats(json.data))
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    if (!address) return;
    void Promise.all([
      fetch(`/api/scans?wallet=${address}`, { cache: "no-store" }).then((res) => res.json()) as Promise<{ data: Scan[] }>,
      fetch(`/api/hunts?creator=${address}`, { cache: "no-store" }).then((res) => res.json()) as Promise<{ data: Hunt[] }>
    ])
      .then(([scanData, huntData]) => {
        setScans(scanData.data || []);
        setHunts(huntData.data || []);
      })
      .catch(() => {
        setScans([]);
        setHunts([]);
      });
  }, [address]);

  const recent = useMemo(() => {
    const scanRows = scans.map((scan) => ({
      id: scan.id,
      type: "scan",
      packageName: `${scan.packageName}@${scan.version}`,
      status: scan.riskLevel || "completed",
      href: `/app/scans/${scan.id}`,
      createdAt: scan.createdAt
    }));
    const huntRows = hunts.map((hunt) => ({
      id: hunt.id,
      type: "hunt",
      packageName: `${hunt.packageName}@${hunt.version}`,
      status: hunt.status,
      href: `/app/hunts/${hunt.id}`,
      createdAt: hunt.createdAt
    }));
    return [...scanRows, ...huntRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [hunts, scans]);

  return (
    <AppShell>
      <PageHeader
        label="PROTOCOL OVERVIEW"
        title="KiteBond Dashboard"
        description="Live scan, hunt, wallet, and contract state for npm package security workflows."
      />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Total Scans", stats?.totalScans ?? "-"],
          ["Open Hunts", stats?.openHunts ?? "-"],
          ["Agents Active", stats?.agentsActive ?? "-"],
          ["USDT In Hunts", `${stats?.totalBonded ?? "-"} USDT`]
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="label-sm">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
          </Card>
        ))}
      </div>

      <Card variant="green" className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="label-sm text-[var(--green)]">Wallet</p>
            <h2 className="mt-2 text-2xl">{address ? truncateHash(address, 8, 6) : "No wallet connected"}</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              KiteAI Testnet · KITE: {kite ? Number(formatUnits(kite.value, kite.decimals)).toFixed(4) : "-"} · USDT:{" "}
              {usdt ? Number(formatUnits(usdt.value, usdt.decimals)).toFixed(2) : "-"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Action href="/app/instant-scan" label="Run Scan" icon={<FileSearch className="h-4 w-4" />} />
            <Action href="/app/agent-hunt" label="Create Hunt" icon={<Radar className="h-4 w-4" />} />
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <p className="label-sm label-orange">Recent Activity</p>
          <div className="mt-4 space-y-3">
            {recent.length === 0 && (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-6 text-center">
                <Clock className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
                <h3 className="mt-3 text-xl">No activity yet</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Run an Instant Scan or create an Agent Hunt to populate this feed.</p>
              </div>
            )}
            {recent.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-3 transition hover:border-[var(--border-orange)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={item.type === "scan" ? "high" : "safe"} label={item.type} />
                    <p className="truncate package-name text-sm text-[var(--text-primary)]">{item.packageName}</p>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={item.status === "critical" ? "critical" : item.status === "high" ? "high" : "pending"} label={item.status} />
                  <ArrowRight className="h-4 w-4 text-[var(--orange)]" />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card variant="glass" className="p-5">
          <p className="label-sm label-orange">Protocol Stats</p>
          <div className="mt-4 space-y-4 text-sm">
            <Info label="Last updated" value={new Date().toLocaleString()} />
            <Info label="Hunt Registry" value={truncateHash(HUNT_REGISTRY_ADDRESS)} href={addressUrl(HUNT_REGISTRY_ADDRESS)} />
            <Info label="Treasury" value={truncateHash(PROTOCOL_TREASURY)} />
            <Info label="Scans today" value={String(stats?.scansToday ?? "-")} />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Action({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-2.5 text-sm font-semibold text-black">
      {icon}
      {label}
    </Link>
  );
}

function Info({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = <p className="address mt-1 text-[var(--text-primary)]">{value}</p>;
  return (
    <div>
      <p className="label-sm">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="hover:text-[var(--orange)]">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}
