"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app/AppShell";
import { RiskBadge } from "@/components/app/RiskBadge";
import { TxLink } from "@/components/shared/TxLink";
import { formatUsdt, truncateHash } from "@/lib/utils";

type Scan = {
  id: string;
  packageName: string;
  version: string;
  scanDepth: string;
  amountPaid: string | null;
  paymentTx: string | null;
  proofTx: string | null;
  reportHash: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  createdAt: string;
};

export default function ScanHistoryPage() {
  const { address } = useAccount();
  const [scans, setScans] = useState<Scan[]>([]);

  useEffect(() => {
    const url = address ? `/api/scans?wallet=${address}` : "/api/scans";
    void fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data?: Scan[] }) => setScans(json.data || []))
      .catch(() => setScans([]));
  }, [address]);

  return (
    <AppShell>
      <div className="card card--orange p-6">
        <p className="label text-brand-orange">Scans</p>
        <h1 className="mt-2 text-3xl">Scan History</h1>
        <p className="mt-3">Instant package scans for the connected wallet.</p>
      </div>

      <div className="grid gap-4">
        {scans.map((scan) => (
          <Link key={scan.id} href={`/proof/${scan.id}`} className="card p-5 transition hover:border-[var(--border-orange)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xl font-semibold text-[var(--text-primary)]">{scan.packageName}@{scan.version}</p>
                <p className="mt-2 text-sm">Depth: {scan.scanDepth} | Paid: {formatUsdt(scan.amountPaid || "0")}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{new Date(scan.createdAt).toLocaleString()}</p>
              </div>
              <div className="text-right">
                {scan.riskLevel && <RiskBadge level={scan.riskLevel} />}
                <div className="mt-3 flex justify-end gap-3">
                  {scan.proofTx ? <TxLink hash={scan.proofTx} /> : <span className="address text-xs text-[var(--text-muted)]">{truncateHash(scan.reportHash, 8, 6)}</span>}
                </div>
              </div>
            </div>
          </Link>
        ))}
        {scans.length === 0 && (
          <div className="card p-8 text-center">
            <p>No scans recorded for this wallet.</p>
            <Link href="/app/instant-scan" className="mt-4 inline-flex text-brand-orange">Run an instant scan</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
