"use client";

import { useEffect, useReducer, useState } from "react";
import CountUp from "react-countup";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Loader2, Lock, ReceiptText, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import { AppShell } from "@/components/app/AppShell";
import { CompactScanStatus, type CompactStage, type CompactStepKey } from "@/components/app/CompactScanStatus";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { PageGlow } from "@/components/shared/PageGlow";
import { useNetworkGuard } from "@/hooks/useNetworkGuard";
import { useTransferScanFee } from "@/hooks/useKiteBond";
import { areContractsConfigured, getMissingContractConfig, getProtocolTreasuryAddress } from "@/lib/contractConfig";
import { ApiError, safeFetch } from "@/lib/safeFetch";
import { initialScanState, isScanBusy, scanReducer, type ScanReport } from "@/lib/scanStateMachine";
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

const INSTANT_PRICE_USDT = "1";

const riskColors: Record<Severity, { bg: string; border: string; text: string }> = {
  clean: { bg: "rgba(0,180,255,0.08)", border: "rgba(0,180,255,0.25)", text: "#00b4ff" },
  low: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", text: "#22c55e" },
  medium: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)", text: "#f59e0b" },
  high: { bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.25)", text: "#fb923c" },
  critical: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", text: "#ef4444" }
};

export default function InstantScanPage() {
  const { address, isConnected } = useAccount();
  const { isCorrectNetwork, switchToKite, isSwitching } = useNetworkGuard();
  const { transferScanFee, isTransferringScanFee } = useTransferScanFee();
  const [packageName, setPackageName] = useState("lodash");
  const [version, setVersion] = useState("latest");
  const [mode, setMode] = useState<"select" | "instant">("select");
  const [context, dispatch] = useReducer(scanReducer, initialScanState);
  const [stage, setStage] = useState<CompactStage>("idle");
  const [failedStep, setFailedStep] = useState<CompactStepKey | undefined>();
  const [quota, setQuota] = useState<{ freeUsed: boolean; freeScansUsed: number; totalScans?: number }>({
    freeUsed: false,
    freeScansUsed: 0
  });

  const busy = isScanBusy(context.state) || isTransferringScanFee;
  const contractsReady = areContractsConfigured();
  const missingContracts = getMissingContractConfig();
  const scanTreasury = (() => {
    try {
      return getProtocolTreasuryAddress();
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

  useEffect(() => {
    let cancelled = false;
    async function loadQuota() {
      if (!address) {
        setQuota({ freeUsed: false, freeScansUsed: 0 });
        return;
      }
      try {
        const json = await safeFetch<{ freeUsed: boolean; freeScansUsed: number; totalScans?: number }>(
          `/api/scan/quota?address=${encodeURIComponent(address)}`,
          { cache: "no-store" }
        );
        if (!cancelled) setQuota(json);
      } catch {
        if (!cancelled) setQuota({ freeUsed: false, freeScansUsed: 0 });
      }
    }
    void loadQuota();
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function runScan() {
    if (busy) return;

    const pkg = packageName.trim();
    const resolvedVersion = version.trim() || "latest";

    dispatch({ type: "START", payload: { packageName: pkg, version: resolvedVersion, scanDepth: "instant" } });
    setStage("authorizing");
    setFailedStep(undefined);

    if (!pkg) {
      dispatch({ type: "ERROR", payload: { error: "Enter an npm package name." } });
      setStage("error");
      setFailedStep("auth");
      toast.error("Enter an npm package name.");
      return;
    }

    const isFree = !quota.freeUsed;
    const price = isFree ? "0" : INSTANT_PRICE_USDT;
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
      let paymentTxHash: `0x${string}` | undefined;
      let onchainScanId = ethers.keccak256(ethers.toUtf8Bytes(`${address || "anonymous"}:${pkg}:${resolvedVersion}:${Date.now()}`)) as `0x${string}`;

      if (!isFree) {
        dispatch({ type: "WALLET_OK" });
        dispatch({ type: "NETWORK_OK" });
        dispatch({ type: "APPROVAL_SIGNED" });
        paymentTxHash = await transferScanFee();
        dispatch({ type: "APPROVAL_CONFIRMED", payload: { txHash: paymentTxHash } });
      }

      setStage("resolving");
      const json = await safeFetch<{ success?: boolean; data?: ScanResult; error?: string }>("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package: pkg,
          version: resolvedVersion,
          address,
          walletAddress: address,
          paymentTxHash,
          onchainScanId,
          scanType: "instant"
        })
      });
      if (!json.data) {
        throw new Error(json.error || "Scan failed.");
      }
      dispatch({ type: "PACKAGE_RESOLVED" });
      dispatch({ type: "METADATA_INSPECTED" });
      dispatch({ type: "SIGNALS_COMPUTED" });
      onchainScanId = json.data.onchainScanId;
      setStage("analyzing");

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
      if (address) {
        setQuota((current) => ({
          ...current,
          freeUsed: true,
          freeScansUsed: Math.max(current.freeScansUsed, 1),
          totalScans: (current.totalScans ?? 0) + 1
        }));
      }
      toast.success("Package scan complete.");
    } catch (error) {
      const message = getErrorMessage(error);
      dispatch({ type: "ERROR", payload: { error: message } });
      setStage("error");
      setFailedStep(getFailedStep(error));
      toast.error(message);
    }
  }

  function resetScan() {
    dispatch({ type: "RESET" });
    setStage("idle");
    setFailedStep(undefined);
    setPackageName("");
    setVersion("latest");
  }

  return (
    <AppShell>
      <PageGlow color="green" position="top-left" />
      <PageHeader
        label="INSTANT SCAN"
        title="Package Scanner"
        description="Scan any npm package by name. KiteBond uses registry metadata, deterministic risk signals, and Heurist analysis without executing package code."
      />
      <AnimatePresence mode="wait">
        {mode === "select" ? (
          <motion.div
            key="mode-select"
            initial={{ opacity: 0, y: -22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mx-auto w-full max-w-[980px]"
          >
            <Card variant="glass" className="mb-5 border-[var(--border-orange)] bg-[linear-gradient(180deg,rgba(12,12,26,0.92),rgba(8,8,18,0.9))] p-7">
              <p className="label-sm label-orange">Select Scan Mode</p>
              <h2 className="mt-3 text-[clamp(1.6rem,2.4vw,2.5rem)]">Choose Security Audit Depth</h2>
              <p className="mt-3 max-w-[74ch] text-sm text-[var(--text-secondary)]">
                Instant Scan is the live KiteBond product and runs the full safe npm investigation pipeline.
                Deep Scan previews the upcoming runtime sandbox system and stays locked in this release.
              </p>
            </Card>

            <div className="grid md:grid-cols-2 gap-8 w-full mx-auto mt-8">
              <div className="relative group rounded-2xl bg-[#080812] border border-[#fb923c]/30 shadow-[0_0_30px_rgba(251,146,60,0.1)] transition-all hover:shadow-[0_0_50px_rgba(251,146,60,0.2)] overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-[#fb923c] to-transparent opacity-80" />
                <div className="absolute inset-0 bg-gradient-to-b from-[#fb923c]/5 to-transparent pointer-events-none" />
                
                <div className="p-8 relative z-10 flex flex-col h-full">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold tracking-wide text-white uppercase font-display">Instant Scan</h3>
                    <span className="px-3 py-1 text-[10px] uppercase tracking-widest font-mono text-[#00ff64] bg-[#00ff64]/10 border border-[#00ff64]/30 rounded-full shadow-[0_0_10px_rgba(0,255,100,0.2)]">Live</span>
                  </div>
                  
                  <div className="mb-6 inline-flex items-center w-fit px-4 py-2 rounded-lg bg-black/40 border border-white/10 shadow-inner">
                    <span className="font-mono text-sm tracking-wider text-gray-200">
                      {quota.freeUsed ? "1 USDT · KiteAI Testnet" : "Your first scan is free"}
                    </span>
                  </div>

                  <p className="text-sm text-gray-400 leading-relaxed mb-8 flex-1">
                    KiteBond&apos;s full safe npm security audit - registry intelligence, dependency analysis, script-risk detection, safe file-structure inspection, and Heurist-backed evidence reasoning. No package code executed.
                  </p>

                  <ul className="space-y-3 mb-8">
                    {[
                      "Registry metadata and version checks",
                      "Maintainer, repository, and license signals",
                      "Dependency and typosquat risk analysis",
                      "Lifecycle script and malware-pattern detection",
                      "Safe tarball and file-structure inspection",
                      "Known incident intelligence with version matching",
                      "Heurist forensic investigation"
                    ].map(feat => (
                      <li key={feat} className="flex items-start gap-3 text-sm text-gray-300">
                        <ShieldCheck className="w-5 h-5 text-[#00ff64] shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => setMode("instant")}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-[#fb923c] to-[#f97316] text-black font-bold uppercase tracking-wider text-sm transition-all hover:opacity-90 shadow-[0_0_20px_rgba(251,146,60,0.4)]"
                  >
                    Start Scan
                  </button>
                </div>
              </div>

              <div className="relative rounded-2xl bg-[#03030a] border border-white/5 shadow-lg overflow-hidden">
                <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(255,255,255,0.02)_8px,rgba(255,255,255,0.02)_9px)] pointer-events-none" />
                
                <div className="p-8 relative z-10 flex flex-col h-full opacity-60">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold tracking-wide text-gray-400 uppercase font-display">Deep Scan</h3>
                    <span className="px-3 py-1 text-[10px] uppercase tracking-widest font-mono text-[#9b5de5] bg-[#9b5de5]/10 border border-[#9b5de5]/30 rounded-full">Coming Soon</span>
                  </div>
                  
                  <div className="mb-6 inline-flex items-center w-fit px-4 py-2 rounded-lg bg-black/40 border border-white/5 shadow-inner">
                    <span className="font-mono text-sm tracking-wider text-gray-500">Locked</span>
                  </div>

                  <p className="text-sm text-gray-500 leading-relaxed mb-8 flex-1">
                    Future runtime analysis for high-risk packages using isolated sandbox workers, behavioral tracing, runtime monitoring, and defensive verification tests.
                  </p>

                  <ul className="space-y-3 mb-8">
                    {[
                      "Isolated dynamic sandbox execution",
                      "Behavioral trace capture",
                      "Runtime package monitoring",
                      "Defensive verification tests",
                      "Execution proof and attestation"
                    ].map(feat => (
                      <li key={feat} className="flex items-start gap-3 text-sm text-gray-500">
                        <Lock className="w-4 h-4 mt-0.5 text-gray-600 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <button disabled className="w-full py-4 rounded-xl bg-white/5 text-gray-500 font-bold uppercase tracking-wider text-sm border border-white/10 cursor-not-allowed flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4" /> Locked
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="scanner"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.68fr)]"
          >
        <div className="space-y-5">
          <Card variant="orange" className="p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="badge-live">Instant Scan</span>
                <p className="text-xs text-[var(--text-secondary)]">
                  {quota.freeUsed ? "1 USDT · KiteAI Testnet" : "Your first scan is free"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMode("select")}
                className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-orange)] hover:text-[var(--text-primary)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Change Mode
              </button>
            </div>
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
            <button
              type="button"
              onClick={runScan}
              disabled={busy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-3 font-semibold text-black transition hover:bg-[var(--orange-bright)] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {busy ? "Scan in progress" : "Run Instant Scan"}
            </button>

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

            {scanTreasury && (
              <div className="mt-4 text-xs text-[var(--text-secondary)]">
                <span className="font-mono">Paid scan treasury: </span>
                <a
                  href={`https://testnet.kitescan.ai/address/${scanTreasury}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[var(--blue)]"
                >
                  {scanTreasury.slice(0, 8)}...{scanTreasury.slice(-6)}
                </a>
              </div>
            )}

            <CompactScanStatus stage={stage} state={context.state} error={context.error} isFree={context.isFree} failedStep={failedStep} />
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
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start border-b border-[var(--border-dim)] pb-5">
                <div>
                  <p className="label-sm text-[var(--green)]">Report</p>
                  <h2 className="mt-2 text-3xl package-name">
                    {result.report.packageName}@{result.report.version}
                  </h2>
                </div>
              </div>

              <ReportSlideshow report={result.report} />

              <Link
                href={`/app/agent-hunt?package=${encodeURIComponent(result.report.packageName)}&version=${encodeURIComponent(result.report.version)}`}
                className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-orange)] px-4 py-3 text-sm font-semibold text-[var(--orange)]"
              >
                Investigate further with Agent Hunt <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={resetScan}
                className="mt-5 ml-3 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]"
              >
                Scan Another Package
              </button>
            </Card>
          )}
        </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function ReportSlideshow({ report }: { report: ScanReport }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const severityWeight: Record<Severity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    clean: 1
  };

  const topReasons = [...report.signals]
    .sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity])
    .slice(0, 5);

  const groupedSignals = {
    incidents: report.signals.filter((signal) => /KNOWN_INCIDENT/i.test(signal.evidence)),
    metadata: report.signals.filter((signal) => signal.type === "metadata_signal" || signal.type === "maintainer_signal" || signal.type === "repository_signal"),
    scripts: report.signals.filter((signal) => signal.type === "install_script"),
    dependencyAndFiles: report.signals.filter((signal) => signal.type === "dependency_risk" || signal.type === "tarball_signal" || signal.type === "typosquat")
  };

  const slides = [
    {
      title: "Verdict",
      content: (
        <div className="flex flex-col items-center text-center mt-6">
          <div className="mb-4">
            <Badge tone={report.riskLevel} label={report.riskLevel.toUpperCase()} />
          </div>
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-glass)] p-5 w-full max-w-sm mb-6">
            <p className="label-sm text-[var(--text-secondary)]">Risk Score</p>
            <p className="mt-2 text-7xl font-bold text-[var(--text-primary)]">
              <CountUp end={report.riskScore} duration={1} />
            </p>
          </div>
          <p className="text-lg text-[var(--text-primary)] font-medium max-w-lg">
            {buildVerdictLine(report.riskLevel, report.packageName, report.version)}
          </p>
          <p className="mt-4 text-sm text-[var(--text-secondary)] max-w-lg leading-relaxed">{report.summary}</p>
        </div>
      )
    },
    {
      title: "Why This Score",
      content: (
        <div className="grid gap-3">
          {topReasons.map((reason, index) => (
            <Card key={`reason-${index}`} variant="glass" className="p-4" style={{ borderColor: riskColors[reason.severity].border, background: riskColors[reason.severity].bg }}>
              <div className="mb-2">
                <Badge tone={reason.severity} label={reason.severity} />
              </div>
              <p className="text-sm text-[var(--text-primary)] font-medium">{reason.evidence}</p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">{reason.recommendation}</p>
            </Card>
          ))}
          {topReasons.length === 0 && (
            <div className="text-center mt-12">
              <ShieldCheck className="mx-auto h-12 w-12 text-[var(--green)] opacity-50 mb-4" />
              <p className="text-sm text-[var(--text-secondary)]">No significant risk factors identified for this package.</p>
            </div>
          )}
        </div>
      )
    },
    {
      title: "Known Incident Intelligence",
      content: <SlideSignalList items={groupedSignals.incidents} emptyMessage="No known incidents recorded for this package version." />
    },
    {
      title: "Package Identity",
      content: <SlideSignalList items={groupedSignals.metadata} emptyMessage="Identity and metadata signals are clean." />
    },
    {
      title: "Script & File Signals",
      content: <SlideSignalList items={groupedSignals.scripts} emptyMessage="No suspicious lifecycle scripts detected." />
    },
    {
      title: "Dependency & Typosquat Risk",
      content: <SlideSignalList items={groupedSignals.dependencyAndFiles} emptyMessage="No dependency or typosquat risks identified." />
    },
    {
      title: "Recommendation",
      content: (
        <div className="flex flex-col items-center text-center mt-8">
          <Badge tone="verified" label={formatRecommendation(report.finalRecommendation)} />
          <p className="mt-6 text-base text-[var(--text-primary)] font-medium max-w-md">
            Confidence: {Math.round(report.confidence * 100)}%
          </p>
          <p className="mt-4 text-sm text-[var(--text-secondary)] max-w-lg leading-relaxed">
            Based on the combined deterministic signals and heuristic analysis, the recommended action for this package is highlighted above. Always ensure your environment matches your security posture before proceeding with installation.
          </p>
        </div>
      )
    }
  ];

  const next = () => setCurrentSlide(c => Math.min(c + 1, slides.length - 1));
  const prev = () => setCurrentSlide(c => Math.max(c - 1, 0));

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-bold font-display tracking-wide text-[var(--text-primary)]">{slides[currentSlide].title}</h3>
        <div className="text-xs font-mono font-bold text-[var(--text-muted)] bg-[var(--bg-glass)] px-3 py-1.5 rounded-full border border-[var(--border-dim)]">
          {currentSlide + 1} / {slides.length}
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="mb-8 flex gap-1.5 h-1.5 w-full">
        {slides.map((_, idx) => (
          <div key={idx} className={`flex-1 rounded-full transition-colors duration-300 ${idx <= currentSlide ? 'bg-[var(--cyber-green)] shadow-[0_0_8px_rgba(0,255,100,0.4)]' : 'bg-[var(--border-dim)]'}`} />
        ))}
      </div>

      <div className="min-h-[380px] relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {slides[currentSlide].content}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-10 flex justify-between pt-5 border-t border-[var(--border-dim)]">
        <button onClick={prev} disabled={currentSlide === 0} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--bg-glass)] border border-[var(--border-default)] px-5 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-surface)] hover:text-white disabled:opacity-30 disabled:hover:bg-[var(--bg-glass)] disabled:hover:text-[var(--text-secondary)]">
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <button onClick={next} disabled={currentSlide === slides.length - 1} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--bg-card-hover)] border border-[var(--border-default)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-all hover:border-[var(--cyber-green)] hover:text-[var(--cyber-green)] disabled:opacity-30 disabled:hover:border-[var(--border-default)] disabled:hover:text-[var(--text-primary)]">
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SlideSignalList({ items, emptyMessage }: { items: ScanReport["signals"], emptyMessage: string }) {
  if (items.length === 0) {
    return (
      <div className="text-center mt-12">
        <ShieldCheck className="mx-auto h-12 w-12 text-[var(--green)] opacity-50 mb-4" />
        <p className="text-sm text-[var(--text-secondary)]">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {items.map((signal, index) => (
        <Card key={index} variant="glass" className="p-4" style={{ borderColor: riskColors[signal.severity].border, background: riskColors[signal.severity].bg }}>
          <div className="mb-2">
            <Badge tone={signal.severity} label={signal.severity} />
          </div>
          <p className="text-sm text-[var(--text-primary)] font-medium">{signal.evidence}</p>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">{signal.recommendation}</p>
        </Card>
      ))}
    </div>
  );
}

function buildVerdictLine(level: Severity, packageName: string, version: string) {
  if (level === "critical") {
    return `${packageName}@${version} shows critical pre-install risk indicators. Do not install until manual review is complete.`;
  }
  if (level === "high") {
    return `${packageName}@${version} shows high-risk evidence that requires immediate manual verification before use.`;
  }
  if (level === "medium") {
    return `${packageName}@${version} has meaningful risk signals. Use with caution and verify provenance before production use.`;
  }
  if (level === "low") {
    return `${packageName}@${version} has low-severity risk signals. Continue with normal dependency hygiene and lockfile pinning.`;
  }
  return `${packageName}@${version} shows no significant risk evidence in this static pre-install audit.`;
}

function formatRecommendation(value: ScanReport["finalRecommendation"]) {
  return value.replace(/_/g, " ").toUpperCase();
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
      return "Analysis timed out. Try again or use Instant Scan.";
    }
    if (err.status >= 500) return `Server error. ${err.message}`;
    return err.message;
  }

  return err instanceof Error ? err.message : "Unknown error. Try again.";
}
