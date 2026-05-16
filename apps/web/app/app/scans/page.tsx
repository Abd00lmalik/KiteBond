"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { AppShell } from "@/components/app/AppShell";
import { PageGlow } from "@/components/shared/PageGlow";
import { RiskBadge } from "@/components/app/RiskBadge";
import { safeFetch } from "@/lib/safeFetch";
import { formatUsdt } from "@/lib/utils";

type Scan = {
  id: string;
  packageName: string;
  version: string;
  scanDepth: string;
  amountPaid: string | null;
  paymentTx: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  createdAt: string;
};

export default function ScanHistoryPage() {
  const { address } = useAccount();
  const [scans, setScans] = useState<Scan[]>([]);

  useEffect(() => {
    const url = address ? `/api/scans?wallet=${address}` : "/api/scans";
    void safeFetch<{ data?: Scan[] }>(url, { cache: "no-store" })
      .then((json: { data?: Scan[] }) => setScans(json.data || []))
      .catch(() => setScans([]));
  }, [address]);

  return (
    <AppShell>
      <PageGlow color="green" position="top-left" />
      <div className="card card--orange p-6">
        <p className="label text-brand-orange">Scans</p>
        <h1 className="mt-2 text-3xl">Scan History</h1>
        <p className="mt-3">Instant package scans for the connected wallet.</p>
      </div>

      <div className="grid gap-4">
        {scans.map((scan) => (
          <div key={scan.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xl font-semibold text-[var(--text-primary)]">{scan.packageName}@{scan.version}</p>
                <p className="mt-2 text-sm">Depth: {scan.scanDepth} | Paid: {formatUsdt(scan.amountPaid || "0")}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{new Date(scan.createdAt).toLocaleString()}</p>
              </div>
              <div className="text-right">
                {scan.riskLevel && <RiskBadge level={scan.riskLevel} />}
                {scan.riskScore !== null && <p className="mt-3 text-xs text-[var(--text-muted)]">Risk score {scan.riskScore}</p>}
              </div>
            </div>
          </div>
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
