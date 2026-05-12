"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { TxLink } from "@/components/shared/TxLink";
import { truncateHash } from "@/lib/utils";

type ScanProof = {
  id: string;
  packageName: string;
  version: string;
  proofTx: string | null;
  reportHash: string | null;
  createdAt: string;
};

type HuntProof = {
  id: string;
  chainHuntId: number | null;
  packageName: string;
  version: string;
  settlementTx: string | null;
  winnerAddress: string | null;
  status: string;
  updatedAt: string;
};

export default function ProofArchivePage() {
  const [tab, setTab] = useState<"scans" | "hunts">("scans");
  const [scanProofs, setScanProofs] = useState<ScanProof[]>([]);
  const [huntProofs, setHuntProofs] = useState<HuntProof[]>([]);

  useEffect(() => {
    void fetch("/api/scans?proofed=true", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data?: ScanProof[] }) => setScanProofs(json.data || []))
      .catch(() => setScanProofs([]));
    void fetch("/api/hunts?status=Settled", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { data?: HuntProof[] }) => setHuntProofs(json.data || []))
      .catch(() => setHuntProofs([]));
  }, []);

  return (
    <AppShell>
      <div className="card card--orange p-6">
        <p className="label text-brand-orange">Proof Archive</p>
        <h1 className="mt-2 text-3xl">Verifiable Records</h1>
        <p className="mt-3">Scan proof anchors and settled hunt records with KiteScan links.</p>
      </div>

      <div className="flex gap-2">
        {(["scans", "hunts"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${tab === item ? "border-[var(--border-orange)] bg-[var(--orange-dim)] text-brand-orange" : "border-[var(--border-default)] text-[var(--text-secondary)]"}`}>
            {item}
          </button>
        ))}
      </div>

      {tab === "scans" ? (
        <div className="grid gap-3">
          {scanProofs.map((proof) => (
            <Link key={proof.id} href={`/proof/${proof.id}`} className="card grid gap-3 p-4 transition hover:border-[var(--border-orange)] md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{proof.packageName}@{proof.version}</p>
                <p className="address text-xs text-[var(--text-muted)]">{truncateHash(proof.reportHash, 10, 8)}</p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">{new Date(proof.createdAt).toLocaleString()}</p>
              <TxLink hash={proof.proofTx} />
            </Link>
          ))}
          {scanProofs.length === 0 && <Empty text="No scan proofs recorded yet." />}
        </div>
      ) : (
        <div className="grid gap-3">
          {huntProofs.map((proof) => (
            <Link key={proof.id} href={`/app/hunts/${proof.id}`} className="card grid gap-3 p-4 transition hover:border-[var(--border-orange)] md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{proof.packageName}@{proof.version}</p>
                <p className="text-xs text-[var(--text-muted)]">Winner {truncateHash(proof.winnerAddress, 8, 6)}</p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">Hunt #{proof.chainHuntId ?? proof.id}</p>
              <TxLink hash={proof.settlementTx} />
            </Link>
          ))}
          {huntProofs.length === 0 && <Empty text="No settled hunts recorded yet." />}
        </div>
      )}
    </AppShell>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card p-8 text-center">
      <p>{text}</p>
    </div>
  );
}
