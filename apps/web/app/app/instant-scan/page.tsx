"use client";

import { useMemo, useReducer, useState } from "react";
import CountUp from "react-countup";
import Link from "next/link";
import { ArrowRight, Copy, Loader2, ReceiptText, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader } from "@/components/app/PageHeader";
import { ScanPipeline } from "@/components/app/ScanPipeline";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { TxLink } from "@/components/shared/TxLink";
import { useNetworkGuard } from "@/hooks/useNetworkGuard";
import { useApproveToken, useAuthorizeScan, useRecordScanReceipt } from "@/hooks/useKiteBond";
import { SCAN_PAYMENTS_ADDRESS } from "@/lib/contract";
import { initialScanState, isScanBusy, scanReducer, type ScanDepth, type ScanReport } from "@/lib/scanStateMachine";
import type { Severity } from "@/lib/heuristics";
import { useAccount } from "wagmi";

type ScanResult = {
  scanId: string;
  onchainScanId: `0x${string}`;
  report: ScanReport;
  reportHash: `0x${string}`;
  isFreeQuick: boolean;
  price: string;
};

const prices: Record<ScanDepth, string> = { quick: "0", standard: "1", deep: "3" };

const riskColors: Record<Severity, { bg: string; border: string; text: string }> = {
  low: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", text: "#22c55e" },
  medium: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "#f59e0b" },
  high: { bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.25)", text: "#fb923c" },
  critical: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "#ef4444" }
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function InstantScanPage() {
  const { address, isConnected } = useAccount();
  const { isCorrectNetwork, switchToKite, isSwitching } = useNetworkGuard();
  const { approve, isApproving } = useApproveToken();
  const { authorizeScan, isAuthorizing } = useAuthorizeScan();
  const { recordReceipt, isRecordingReceipt } = useRecordScanReceipt();
  const [packageName, setPackageName] = useState("lodash");
  const [version, setVersion] = useState("latest");
  const [scanDepth, setScanDepth] = useState<ScanDepth>("quick");
  const [context, dispatch] = useReducer(scanReducer, initialScanState);

  const busy = isScanBusy(context.state) || isApproving || isAuthorizing || isRecordingReceipt;
  const result = context.report
    ? {
        report: context.report,
        reportHash: context.reportHash,
        scanId: context.scanId,
        onchainScanId: context.onchainScanId
      }
    : null;

  const paymentCopy = useMemo(() => {
    if (context.isFree) return "This scan does not require a USDT payment.";
    return `Approve ${context.price} USDT, then authorize the scan on Kite.`;
  }, [context.isFree, context.price]);

  async function runScan() {
    const pkg = packageName.trim();
    const resolvedVersion = version.trim() || "latest";

    dispatch({ type: "START", payload: { packageName: pkg, version: resolvedVersion, scanDepth } });

    if (!pkg) {
      dispatch({ type: "ERROR", payload: { error: "Enter an npm package name." } });
      toast.error("Enter an npm package name.");
      return;
    }

    if (!isConnected || !address) {
      dispatch({ type: "ERROR", payload: { error: "Connect your wallet first." } });
      toast.error("Connect your wallet before scanning.");
      return;
    }
    dispatch({ type: "WALLET_OK" });

    if (!isCorrectNetwork) {
      dispatch({ type: "ERROR", payload: { error: "Switch to KiteAI Testnet before scanning." } });
      toast.error("Switch to KiteAI Testnet.");
      return;
    }
    dispatch({ type: "NETWORK_OK" });

    const price = prices[scanDepth];
    const isFree = Number(price) === 0;
    dispatch({ type: "PRICE_CHECKED", payload: { isFree, price } });

    try {
      let authTxHash: `0x${string}` | undefined;
      const packageHash = ethers.keccak256(ethers.toUtf8Bytes(pkg)) as `0x${string}`;
      const versionHash = ethers.keccak256(ethers.toUtf8Bytes(resolvedVersion)) as `0x${string}`;
      const onchainScanId = ethers.keccak256(
        ethers.toUtf8Bytes(`${address}:${pkg}:${resolvedVersion}:${scanDepth}:${Date.now()}`)
      ) as `0x${string}`;

      if (!isFree) {
        await sleep(120);
        dispatch({ type: "APPROVAL_SIGNED" });
        const approveTxHash = await approve({ spender: SCAN_PAYMENTS_ADDRESS, amount: price });
        dispatch({ type: "APPROVAL_CONFIRMED", payload: { txHash: approveTxHash } });

        dispatch({ type: "AUTH_SIGNED" });
        authTxHash = await authorizeScan({
          packageNameHash: packageHash,
          versionHash,
          depth: scanDepth,
          scanId: onchainScanId
        });
        dispatch({ type: "AUTH_CONFIRMED", payload: { txHash: authTxHash } });
      }

      const scanPromise = fetch("/api/scan/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageName: pkg,
          version: resolvedVersion,
          scanDepth,
          walletAddress: address,
          paymentTxHash: authTxHash,
          onchainScanId
        })
      });

      await sleep(450);
      dispatch({ type: "PACKAGE_RESOLVED" });
      await sleep(450);
      dispatch({ type: "METADATA_INSPECTED" });
      await sleep(450);
      dispatch({ type: "SIGNALS_COMPUTED" });

      const res = await scanPromise;
      const json = (await res.json()) as { data?: ScanResult; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error || "Scan failed");
      }

      dispatch({ type: "HEURIST_COMPLETE", payload: { partial: json.data.report } });
      await sleep(300);
      dispatch({
        type: "REPORT_BUILT",
        payload: {
          report: json.data.report,
          reportHash: json.data.reportHash,
          scanId: json.data.scanId,
          onchainScanId: json.data.onchainScanId
        }
      });
      toast.success("Package scan complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan failed.";
      dispatch({ type: "ERROR", payload: { error: message } });
      toast.error(message);
    }
  }

  async function saveReceipt() {
    if (!context.onchainScanId || !context.reportHash || !context.scanId) return;
    try {
      dispatch({ type: "RECORDING_RECEIPT" });
      const txHash = await recordReceipt({ scanId: context.onchainScanId, reportHash: context.reportHash });
      await fetch("/api/scan/anchor-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: context.scanId, reportHash: context.reportHash, txHash })
      });
      dispatch({ type: "RECEIPT_RECORDED", payload: { txHash } });
      toast.success("Scan receipt recorded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Receipt transaction failed.";
      dispatch({ type: "ERROR", payload: { error: message } });
      toast.error(message);
    }
  }

  return (
    <AppShell>
      <PageHeader
        label="INSTANT SCAN"
        title="Package Scanner"
        description="Scan any npm package by name. KiteBond uses registry metadata, deterministic risk signals, and Heurist analysis without executing package code."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.68fr)]">
        <div className="space-y-5">
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

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {(["quick", "standard", "deep"] as const).map((depth) => (
                <button
                  key={depth}
                  type="button"
                  onClick={() => setScanDepth(depth)}
                  className="rounded-[var(--radius-md)] border p-4 text-left transition"
                  style={{
                    borderColor: scanDepth === depth ? "var(--border-orange)" : "var(--border-dim)",
                    background: scanDepth === depth ? "var(--orange-dim)" : "var(--bg-glass)"
                  }}
                >
                  <p className="font-semibold capitalize text-[var(--text-primary)]">{depth} Scan</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {depth === "quick" ? "First scan free · 0 USDT after" : `${prices[depth]} USDT`}
                  </p>
                </button>
              ))}
            </div>

            {!isCorrectNetwork && (
              <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border-red)] bg-[var(--red-dim)] p-4 text-sm text-[var(--red)]">
                Switch to KiteAI Testnet before running a scan.
                <button
                  type="button"
                  onClick={switchToKite}
                  disabled={isSwitching}
                  className="ml-3 rounded-[var(--radius-sm)] bg-[var(--red)] px-3 py-1.5 font-semibold text-white disabled:opacity-60"
                >
                  {isSwitching ? "Switching..." : "Switch Network"}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={runScan}
              disabled={busy}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-3 font-semibold text-black transition hover:bg-[var(--orange-bright)] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy ? "Scan in progress" : "Run Scan"}
            </button>

            {context.state !== "idle" && (
              <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-4 text-sm text-[var(--text-secondary)]">
                <span className="text-[var(--text-primary)]">Current step:</span> {context.state.replace(/_/g, " ")}. {paymentCopy}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="label-sm label-orange">Pricing</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Quick Scan</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Free first scan, then 0 USDT.</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Standard</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">1 USDT for deeper analysis.</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Deep</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">3 USDT for higher review depth.</p>
              </div>
            </div>
          </Card>

          <ScanPipeline
            currentState={context.state}
            isFree={context.isFree}
            paymentTxHash={context.paymentTxHash}
            authTxHash={context.authTxHash}
            receiptTxHash={context.receiptTxHash}
            error={context.error}
            failedState={context.failedState}
          />
        </div>

        <div className="space-y-5">
          {!result && (
            <Card variant="glass" className="flex min-h-[380px] flex-col justify-center p-8 text-center">
              <ReceiptText className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
              <h2 className="mt-5 text-2xl">Report appears after completion</h2>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                The scanner waits for wallet and network checks first. Package analysis starts only after the required authorization state is complete.
              </p>
            </Card>
          )}

          {result?.report && result.reportHash && (
            <Card variant="green" className="p-6">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <p className="label-sm text-[var(--green)]">Report</p>
                  <h2 className="mt-2 text-3xl package-name">
                    {result.report.packageName}@{result.report.version}
                  </h2>
                </div>
                <Badge tone={result.report.riskLevel} label={result.report.riskLevel} />
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-[160px_1fr]">
                <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] p-5 text-center">
                  <p className="label-sm">Risk Score</p>
                  <p className="mt-3 text-5xl font-bold text-[var(--text-primary)]">
                    <CountUp end={result.report.riskScore} duration={1} />
                  </p>
                </div>
                <div>
                  <p>{result.report.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge tone="verified" label={result.report.finalRecommendation.replace(/_/g, " ")} />
                    <Badge tone="pending" label={`confidence ${Math.round(result.report.confidence * 100)}%`} />
                  </div>
                  {result.report.limitations.length > 0 && (
                    <p className="mt-3 text-xs text-[var(--text-muted)]">
                      Limitations: {result.report.limitations.join("; ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                {result.report.signals.length === 0 && (
                  <Card variant="glass" className="p-4">
                    <p className="text-sm text-[var(--text-secondary)]">No deterministic or AI risk signals were reported.</p>
                  </Card>
                )}
                {result.report.signals.map((signal, index) => (
                  <Card
                    key={`${signal.type}-${index}`}
                    className="p-4"
                    style={{
                      borderColor: riskColors[signal.severity].border,
                      background: riskColors[signal.severity].bg
                    }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Badge tone={signal.severity} label={signal.severity} />
                      <span className="text-xs text-[var(--text-muted)]">{signal.type}</span>
                    </div>
                    <p className="text-sm">{signal.evidence}</p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">-&gt; {signal.recommendation}</p>
                  </Card>
                ))}
              </div>

              <Card variant="glass" className="mt-6 p-5">
                <p className="label-sm label-orange">On-chain scan receipt</p>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  Only the report hash and payment reference are stored on Kite. The full report stays readable in the app.
                  Anyone can verify the report was not altered after it was generated.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  <span className="hash">Report hash: {result.reportHash.slice(0, 10)}...{result.reportHash.slice(-8)}</span>
                  <button
                    type="button"
                    onClick={() => result.reportHash && navigator.clipboard.writeText(result.reportHash)}
                    className="inline-flex items-center gap-1 text-[var(--orange)]"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                  {context.receiptTxHash ? (
                    <TxLink hash={context.receiptTxHash} />
                  ) : (
                    <button
                      type="button"
                      onClick={saveReceipt}
                      disabled={isRecordingReceipt}
                      className="rounded-[var(--radius-md)] bg-[var(--orange)] px-3 py-2 font-semibold text-black disabled:opacity-60"
                    >
                      {isRecordingReceipt ? "Recording..." : "Save Report Hash on Kite"}
                    </button>
                  )}
                </div>
              </Card>

              <Link
                href={`/app/agent-hunt?package=${encodeURIComponent(result.report.packageName)}&version=${encodeURIComponent(result.report.version)}`}
                className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-orange)] px-4 py-3 text-sm font-semibold text-[var(--orange)]"
              >
                Investigate further with Agent Hunt <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
