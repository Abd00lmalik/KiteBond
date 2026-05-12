import Link from "next/link";
import { notFound } from "next/navigation";
import { TxLink } from "@/components/shared/TxLink";
import { prisma } from "@/lib/db";
import { truncateHash } from "@/lib/utils";

export async function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: `KiteBond Proof - ${params.id}`
  };
}

export default async function ProofPage({ params }: { params: { id: string } }) {
  const scan = await prisma.instantScan.findFirst({
    where: { OR: [{ id: params.id }, { scanId: params.id }] }
  });

  if (scan) {
    const report = toRecord(scan.reportJson);
    return (
      <main className="min-h-screen px-6 py-10 md:px-10">
        <div className="mx-auto max-w-5xl space-y-5">
          <Header type="Instant Scan" title={`${scan.packageName}@${scan.version}`} />
          <div className="card card--orange p-6">
            <p className="label text-brand-orange">Scan Proof</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Info label="Risk Level" value={String(scan.riskLevel || report.riskLevel || "unknown")} />
              <Info label="Risk Score" value={String(scan.riskScore ?? report.riskScore ?? "-")} />
              <Info label="Scan Depth" value={scan.scanDepth} />
            </div>
            {typeof report.summary === "string" && <p className="mt-5">{report.summary}</p>}
          </div>
          <ProofGrid
            items={[
              ["Scan ID", scan.scanId],
              ["Report Hash", scan.reportHash],
              ["Payment Tx", scan.paymentTx],
              ["Proof Tx", scan.proofTx]
            ]}
          />
        </div>
      </main>
    );
  }

  const hunt = await prisma.hunt.findFirst({
    where: Number.isFinite(Number(params.id))
      ? { OR: [{ id: params.id }, { chainHuntId: Number(params.id) }] }
      : { id: params.id },
    include: { submissions: true }
  });

  if (!hunt) notFound();

  return (
    <main className="min-h-screen px-6 py-10 md:px-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <Header type="Agent Hunt" title={`${hunt.packageName}@${hunt.version}`} />
        <div className="card card--orange p-6">
          <p className="label text-brand-orange">Hunt Proof</p>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <Info label="Status" value={hunt.status} />
            <Info label="Reward" value={`${hunt.rewardAmount} USDT`} />
            <Info label="Stake" value={`${hunt.stakeRequired} USDT`} />
            <Info label="Winner" value={hunt.winnerAddress ? truncateHash(hunt.winnerAddress, 8, 6) : "Not selected"} />
          </div>
        </div>
        <ProofGrid
          items={[
            ["Terms Hash", hunt.termsHash],
            ["Created Tx", hunt.createdTx],
            ["Settlement Tx", hunt.settlementTx],
            ["Chain Hunt ID", hunt.chainHuntId ? String(hunt.chainHuntId) : null]
          ]}
        />
      </div>
    </main>
  );
}

function Header({ type, title }: { type: string; title: string }) {
  return (
    <div className="card p-6">
      <Link href="/app/overview" className="text-sm text-brand-orange">KiteBond</Link>
      <p className="label mt-5 text-brand-orange">{type}</p>
      <h1 className="mt-2 text-4xl">{title}</h1>
      <p className="mt-3">Public proof record on KiteBond.</p>
    </div>
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

function ProofGrid({ items }: { items: [string, string | null | undefined][] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="card p-5">
          <p className="label">{label}</p>
          <div className="mt-3">
            {label.toLowerCase().includes("tx") && value?.startsWith("0x") ? (
              <TxLink hash={value} />
            ) : value?.startsWith("0x") ? (
              <p className="address break-all text-sm text-[var(--text-primary)]">{value}</p>
            ) : (
              <p className="address break-all text-sm text-[var(--text-primary)]">{value || "Pending"}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
