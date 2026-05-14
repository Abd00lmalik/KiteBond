"use client";

import { useReducer, useState } from "react";
import CountUp from "react-countup";
import Link from "next/link";
import { ArrowRight, Copy, Loader2, ReceiptText, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import { AppShell } from "@/components/app/AppShell";
import { CompactScanStatus, type CompactStage, type CompactStepKey } from "@/components/app/CompactScanStatus";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { PageGlow } from "@/components/shared/PageGlow";
import { TxLink } from "@/components/shared/TxLink";
import { useNetworkGuard } from "@/hooks/useNetworkGuard";
import { useApproveToken, useAuthorizeScan, useRecordScanReceipt } from "@/hooks/useKiteBond";
import { areContractsConfigured, getMissingContractConfig, getScanPaymentsAddress } from "@/lib/contractConfig";
import { ApiError, safeFetch } from "@/lib/safeFetch";
import { initialScanState, isScanBusy, scanReducer, type ScanDepth, type ScanReport } from "@/lib/scanStateMachine";
import type { Severity } from "@/lib/heuristics";
import { useAccount } from "wagmi";

type ScanResult = {
  scanId: string | null;
  onchainScanId: `0x${string}`;
  report: ScanReport;
  reportHash: `0x${string}`;
  packageMeta?: unknown;
  signals?: unknown;
  proofAnchored?: boolean;
};

const prices: Record<ScanDepth, string> = { quick: "0", standard: "1", deep: "3" };

const riskColors: Record<Severity, { bg: string; border: string; text: string }> = {
  low: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", text: "#22c55e" },
  medium: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "#f59e0b" },
  high: { bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.25)", text: "#fb923c" },
  critical: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "#ef4444" }
};

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
  const [stage, setStage] = useState<CompactStage>("idle");
  const [failedStep, setFailedStep] = useState<CompactStepKey | undefined>();

  const busy = isScanBusy(context.state) || isApproving || isAuthorizing || isRecordingReceipt;
  const contractsReady = areContractsConfigured();
  const missingContracts = getMissingContractConfig();
  const scanSpender = (() => {
    try {
      return getScanPaymentsAddress();
    } catch {
      return null;
    }
  })();

  const result = context.report
    ? {
        report: context.report,
        reportHash: context.reportHash,
        scanId: context.scanId,
        onchainScanId: context.onchainScanId
      }
    : null;

  async function runScan() {
    if (busy) return;

    const pkg = packageName.trim();
    const resolvedVersion = version.trim() || "latest";

    dispatch({ type: "START", payload: { packageName: pkg, version: resolvedVersion, scanDepth } });
    setStage("authorizing");
    setFailedStep(undefined);

    if (!pkg) {
      dispatch({ type: "ERROR", payload: { error: "Enter an npm package name." } });
      setStage("error");
      setFailedStep("auth");
      toast.error("Enter an npm package name.");
      return;
    }

    const price = prices[scanDepth];
    const isFree = Number(price) === 0;
    dispatch({ type: "PRICE_CHECKED", payload: { isFree, price } });

    if (!isFree && (!isConnected || !address)) {
      dispatch({ type: "ERROR", payload: { error: "Connect your wallet first." } });
      setStage("error");
      setFailedStep("auth");
      toast.error("Connect your wallet before paid scanning.");
      return;
    }

    if (!isFree && !isCorrectNetwork) {
      dispatch({ type: "ERROR", payload: { error: "Switch to KiteAI Testnet before scanning." } });
      setStage("error");
      setFailedStep("auth");
      toast.error("Switch to KiteAI Testnet.");
      return;
    }

    if (!isFree && !contractsReady) {
      const missing = missingContracts.join(", ");
      const message = missing ? `Contracts not configured (${missing}).` : "Contracts not configured.";
      dispatch({ type: "ERROR", payload: { error: message } });
      setStage("error");
      setFailedStep("auth");
      toast.error(message);
      return;
    }

    try {
      let authTxHash: `0x${string}` | undefined;
      const packageHash = ethers.keccak256(ethers.toUtf8Bytes(pkg)) as `0x${string}`;
      const versionHash = ethers.keccak256(ethers.toUtf8Bytes(resolvedVersion)) as `0x${string}`;
      let onchainScanId = ethers.keccak256(
        ethers.toUtf8Bytes(`${address || "anonymous"}:${pkg}:${resolvedVersion}:${scanDepth}:${Date.now()}`)
      ) as `0x${string}`;

      if (!isFree) {
        dispatch({ type: "WALLET_OK" });
        dispatch({ type: "NETWORK_OK" });
        dispatch({ type: "APPROVAL_SIGNED" });
        const approveTxHash = await approve({ spender: getScanPaymentsAddress(), amount: price });
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

      const json = await safeFetch<{ success?: boolean; data?: ScanResult; error?: string }>("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package: pkg,
          version: resolvedVersion,
          address,
          walletAddress: address,
          paymentTxHash: authTxHash,
          onchainScanId
        })
      });
      if (!json.data) {
        throw new Error(json.error || "Scan failed.");
      }
      dispatch({ type: "PACKAGE_RESOLVED" });
      dispatch({ type: "METADATA_INSPECTED" });
      dispatch({ type: "SIGNALS_COMPUTED" });
      onchainScanId = json.data.onchainScanId;

      dispatch({ type: "HEURIST_COMPLETE", payload: { partial: json.data.report } });
      dispatch({
        type: "REPORT_BUILT",
        payload: {
          report: json.data.report,
          reportHash: json.data.reportHash,
          scanId: json.data.scanId || json.data.onchainScanId,
          onchainScanId
        }
      });
      setStage("complete");
      setFailedStep(undefined);
      toast.success("Package scan complete.");
    } catch (error) {
      const message = getErrorMessage(error);
      dispatch({ type: "ERROR", payload: { error: message } });
      setStage("error");
      setFailedStep(getFailedStep(error));
      toast.error(message);
    }
  }

  async function saveReceipt() {
    if (!context.onchainScanId || !context.reportHash || !context.scanId) return;
    try {
      dispatch({ type: "RECORDING_RECEIPT" });
      const txHash = await recordReceipt({ scanId: context.onchainScanId, reportHash: context.reportHash });
      await safeFetch<{ success?: boolean }>("/api/scan/anchor-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: context.scanId, reportHash: context.reportHash, txHash })
      });
      dispatch({ type: "RECEIPT_RECORDED", payload: { txHash } });
      toast.success("Scan receipt recorded.");
    } catch (error) {
      const message = getErrorMessage(error);
      dispatch({ type: "ERROR", payload: { error: message } });
      toast.error(message);
    }
  }

  return (
    <AppShell>
      <PageGlow color="green" position="top-left" />
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

            {!contractsReady && (
              <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--border-amber)] bg-[var(--amber-dim)] p-4 text-sm text-[var(--amber)]">
                Contracts not deployed. Run the deploy script and restart the app.
                {missingContracts.length > 0 && (
                  <p className="mt-2 font-mono text-xs text-[var(--text-muted)]">Missing: {missingContracts.join(", ")}</p>
                )}
              </div>
            )}

            {scanSpender && (
              <div className="mt-4 text-xs text-[var(--text-secondary)]">
                <span className="font-mono">Approving USDT spend for: </span>
                <a
                  href={`https://testnet.kitescan.ai/address/${scanSpender}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[var(--blue)]"
                >
                  {scanSpender.slice(0, 8)}...{scanSpender.slice(-6)}
                </a>
              </div>
            )}

            <button
              type="button"
              onClick={runScan}
              disabled={busy || (scanDepth !== "quick" && !contractsReady)}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-3 font-semibold text-black transition hover:bg-[var(--orange-bright)] disabled:opacity-60"
              title={!contractsReady && scanDepth !== "quick" ? "Deploy contracts first" : undefined}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy ? "Scan in progress" : "Run Scan"}
            </button>

            <CompactScanStatus stage={stage} state={context.state} error={context.error} isFree={context.isFree} failedStep={failedStep} />
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

function getFailedStep(err: unknown): CompactStepKey {
  if (err instanceof ApiError && err.body) {
    try {
      const parsed = JSON.parse(err.body) as { stage?: string };
      if (parsed.stage === "resolve") return "resolve";
      if (parsed.stage === "analyze") return "analyze";
      if (parsed.stage === "complete" || parsed.stage === "save") return "report";
      return "auth";
    } catch {
      return "auth";
    }
  }
  return "auth";
}

function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Network error. Check your connection.";
    if (err.status === 402) return "Payment required. Approve USDT to continue.";
    if (err.status === 404) return "Package not found on npm registry.";
    if (err.status === 408 || err.message.toLowerCase().includes("timed out")) {
      return "Analysis timed out. Try again or use Quick Scan.";
    }
    if (err.status >= 500) return `Server error. ${err.message}`;
    return err.message;
  }

  return err instanceof Error ? err.message : "Unknown error. Try again.";
}
