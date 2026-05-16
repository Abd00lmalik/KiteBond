"use client";

import { useEffect, useReducer, useState } from "react";
import CountUp from "react-countup";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Lock, ReceiptText, ShieldCheck } from "lucide-react";
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
import { areContractsConfigured, getMissingContractConfig } from "@/lib/contractConfig";
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

const severityStyles: Record<Severity, { bg: string; border: string; text: string }> = {
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
  const [packageName, setPackageName] = useState("");
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
            <div className="mb-6">
              <p className="label-sm label-orange">Choose your security audit plan</p>
              <h2 className="mt-3 text-[clamp(1.7rem,2.6vw,2.55rem)]">Safe npm forensics before install</h2>
              <p className="mt-3 max-w-[72ch] text-sm text-[var(--text-secondary)]">
                Pick the live static audit path now, or preview the locked runtime sandbox track coming next.
              </p>
            </div>
            <div className="scan-cards-row-premium">
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                <Card variant="orange" interactive className="scan-card-premium scan-card-premium-live p-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="m-0 text-xl font-semibold text-[var(--text-primary)]">Instant Scan</h3>
                    <span className="badge-live">Live</span>
                  </div>
                  <p className="scan-price-line">First scan free &middot; then 1 USDT</p>
                  <ul className="scan-feature-list mt-4 space-y-1 text-xs text-[var(--text-muted)]">
                    <li>Safe pre-install npm analysis</li>
                    <li>Metadata, scripts, and dependency inspection</li>
                    <li>Known incident intelligence with version matching</li>
                    <li>Heurist AI forensic investigation</li>
                    <li>No package code executed</li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => setMode("instant")}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-3 font-semibold text-black transition hover:bg-[var(--orange-bright)]"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Start Scan
                  </button>
                </Card>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: -24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: "easeOut", delay: 0.05 }}
              >
                <Card className="scan-card-premium scan-card-premium-locked p-6">
                  <Lock className="scan-card-lock-icon h-8 w-8" />
                  <div className="relative z-[2] mb-3 flex items-center justify-between gap-3">
                    <h3 className="m-0 text-xl font-semibold text-[var(--text-primary)]">Deep Scan</h3>
                    <span className="badge-soon">Coming Soon</span>
                  </div>
                  <p className="scan-price-line relative z-[2]">Runtime forensics track</p>
                  <ul className="relative z-[2] mt-4 space-y-1">
                    <li className="scan-bullet-locked">Isolated runtime sandbox</li>
                    <li className="scan-bullet-locked">Behavior tracing and execution monitoring</li>
                    <li className="scan-bullet-locked">Verification tests</li>
                    <li className="scan-bullet-locked">Execution proof generation</li>
                    <li className="scan-bullet-locked">Full dynamic analysis</li>
                  </ul>
                  <button type="button" disabled className="btn-scan-locked relative z-[2] mt-5">
                    <Lock className="mr-2 inline h-3.5 w-3.5" />
                    Coming Soon
                  </button>
                </Card>
              </motion.div>
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
                  {quota.freeUsed ? "1 USDT on KiteAI Testnet" : "Your first scan is free"}
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

            <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-4 text-sm">
              <p className="font-semibold text-[var(--text-primary)]">
                {quota.freeUsed ? "1 USDT scan fee required" : "Free scan available"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {quota.freeUsed
                  ? "KiteBond will ask your wallet to send the scan fee before analysis starts. If you reject or the transfer fails, the scan will not run."
                  : "This connected wallet has one free Instant Scan. KiteBond marks it as used only after the scan starts successfully."}
              </p>
            </div>

            <CompactScanStatus stage={stage} state={context.state} error={context.error} isFree={context.isFree} failedStep={failedStep} />
          </Card>

          <Card className="p-5">
            <p className="label-sm label-orange">Pricing</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Instant Scan</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">First free, then 1 USDT per scan.</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Deep Scan</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">Locked. Coming soon.</p>
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

          {result?.report && (
            <>
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
            </>
          )}
        </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function ReportSlideshow({ report }: { report: ScanReport }) {
  const [slideIndex, setSlideIndex] = useState(0);
  const topReasons = [...report.signals].sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 3);
  const incidentSignals = report.signals.filter(isIncidentSignal);
  const activeIncidents = incidentSignals.filter((signal) => /active/i.test(signal.evidence));
  const historicalIncidents = incidentSignals.filter((signal) => !/active/i.test(signal.evidence));
  const identitySignals = report.signals.filter((signal) =>
    signal.type === "metadata_signal" || signal.type === "maintainer_signal" || signal.type === "repository_signal" || signal.type === "version_signal"
  );
  const scriptSignals = report.signals.filter((signal) => signal.type === "install_script" || signal.type === "tarball_signal");
  const dependencySignals = report.signals.filter((signal) => signal.type === "dependency_risk" || signal.type === "typosquat");
  const metadata = report.metadata as ScanReport["metadata"] & {
    weeklyDownloads?: number;
    peerDependencyCount?: number;
    tarballInspection?: { fileCount?: number; inspectedTextFiles?: number; totalSizeKb?: number } | null;
  };
  const highRisk = report.riskLevel === "high" || report.riskLevel === "critical";
  const tone = severityTone(report.riskLevel);
  const recommendation = formatRecommendation(report.finalRecommendation);
  const slides = [
    {
      title: "Verdict",
      content: (
        <div className="grid gap-5 md:grid-cols-[150px_1fr]">
          <div className="report-score-dial">
            <p className="label-sm">Risk Score</p>
            <p className="mt-3 text-5xl font-bold text-[var(--text-primary)]">
              <CountUp end={report.riskScore} duration={1} />
            </p>
            <Badge tone={report.riskLevel} label={prettySeverity(report.riskLevel)} />
          </div>
          <div>
            <p className="package-name text-xl text-[var(--text-primary)]">
              {report.packageName}@{report.version}
            </p>
            <p className="mt-4 text-base text-[var(--text-primary)]">{buildVerdictLine(report.riskLevel, report.packageName, report.version)}</p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">{report.summary}</p>
            <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">Primary recommendation: {recommendation}.</p>
          </div>
        </div>
      )
    },
    {
      title: "Why This Score",
      content: (
        <SignalBriefing
          items={topReasons}
          empty="No high-impact signals were promoted; score is driven by clean or low-severity metadata."
          limit={3}
        />
      )
    },
    {
      title: "Known Incident Intelligence",
      content: (
        <div className="grid gap-4">
          <IncidentPanel title="Active affected-version match" items={activeIncidents} empty="No active affected-version match was found for this package version." />
          <IncidentPanel title="Historical context" items={historicalIncidents} empty="No historical incident context was matched for this package." />
        </div>
      )
    },
    {
      title: "Package Identity",
      content: (
        <div className="grid gap-4">
          <div className="report-fact-grid">
            <Fact label="Maintainers" value={metadata.maintainerCount !== undefined ? String(metadata.maintainerCount) : "Unknown"} />
            <Fact label="Repository" value={metadata.repository ? "Linked" : "Not linked"} />
            <Fact label="License" value={metadata.license || "Not specified"} />
            <Fact label="Published" value={metadata.publishedAt ? new Date(metadata.publishedAt).toLocaleDateString() : "Unknown"} />
          </div>
          <SignalBriefing
            items={identitySignals.slice(0, 3)}
            empty="Package identity signals are calm: no maintainer, repository, license, or publication issues were promoted."
            limit={3}
          />
        </div>
      )
    },
    {
      title: "Script & File Signals",
      content: (
        <div className="grid gap-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-4">
            <p className="text-sm text-[var(--text-primary)]">
              KiteBond inspected lifecycle metadata and package file signals without executing package code.
            </p>
            {metadata.tarballInspection && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Static tarball pass: {metadata.tarballInspection.fileCount ?? "unknown"} files, {metadata.tarballInspection.inspectedTextFiles ?? "unknown"} text files inspected.
              </p>
            )}
          </div>
          <SignalBriefing items={scriptSignals.slice(0, 4)} empty="No lifecycle script or static package-file risk was promoted." limit={4} />
        </div>
      )
    },
    {
      title: "Dependency & Typosquat Risk",
      content: (
        <div className="grid gap-4">
          <div className="report-fact-grid">
            <Fact label="Direct dependencies" value={String(metadata.dependencyCount)} />
            <Fact label="Peer dependencies" value={metadata.peerDependencyCount !== undefined ? String(metadata.peerDependencyCount) : "Unknown"} />
            <Fact label="Weekly downloads" value={metadata.weeklyDownloads !== undefined ? metadata.weeklyDownloads.toLocaleString() : "Unknown"} />
          </div>
          <SignalBriefing items={dependencySignals.slice(0, 4)} empty="No dependency-surface or naming-similarity risk was promoted." limit={4} />
        </div>
      )
    },
    {
      title: "Recommendation",
      content: (
        <div>
          <p className="text-2xl font-semibold text-[var(--text-primary)]">{recommendation}</p>
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            {recommendationCopy(report.riskLevel, report.packageName, report.version)}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Badge tone="pending" label={`confidence ${Math.round(report.confidence * 100)}%`} />
            <Badge tone={report.riskLevel} label={prettySeverity(report.riskLevel)} />
          </div>
          {highRisk && (
            <Link
              href={`/app/agent-hunt?package=${encodeURIComponent(report.packageName)}&version=${encodeURIComponent(report.version)}`}
              className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-3 text-sm font-semibold text-black"
            >
              Escalate to Agent Hunt <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )
    }
  ];
  const activeSlide = slides[slideIndex];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") setSlideIndex((current) => Math.min(slides.length - 1, current + 1));
      if (event.key === "ArrowLeft") setSlideIndex((current) => Math.max(0, current - 1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slides.length]);

  return (
    <Card className={`report-briefing-card report-briefing-card-${tone} p-0`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-dim)] px-5 py-4">
        <div>
          <p className="label-sm label-orange">Forensic briefing</p>
          <h2 className="mt-1 text-2xl">{activeSlide.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[var(--text-muted)]">{slideIndex + 1} / {slides.length}</span>
          <Badge tone={report.riskLevel} label={prettySeverity(report.riskLevel)} />
        </div>
      </div>
      <div className="min-h-[360px] p-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSlide.title}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            {activeSlide.content}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-dim)] px-5 py-4">
        <div className="flex gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              onClick={() => setSlideIndex(index)}
              className={`report-slide-dot ${index === slideIndex ? "active" : ""}`}
              aria-label={`Open slide ${index + 1}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSlideIndex((current) => Math.max(0, current - 1))}
            disabled={slideIndex === 0}
            className="report-slide-nav"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            type="button"
            onClick={() => setSlideIndex((current) => Math.min(slides.length - 1, current + 1))}
            disabled={slideIndex === slides.length - 1}
            className="report-slide-nav report-slide-nav-primary"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function SignalBriefing({ items, empty, limit }: { items: ScanReport["signals"]; empty: string; limit: number }) {
  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-4">
        <p className="text-sm text-[var(--text-secondary)]">{empty}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.slice(0, limit).map((signal, index) => (
        <div
          key={`${signal.evidence}-${index}`}
          className="rounded-[var(--radius-md)] border p-4"
          style={{ borderColor: severityStyles[signal.severity].border, background: severityStyles[signal.severity].bg }}
        >
          <div className="mb-2 flex items-center gap-2">
            <Badge tone={signal.severity} label={prettySeverity(signal.severity)} />
          </div>
          <p className="text-sm text-[var(--text-primary)]">{stripSource(signal.evidence)}</p>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">{signal.recommendation}</p>
        </div>
      ))}
    </div>
  );
}

function IncidentPanel({ title, items, empty }: { title: string; items: ScanReport["signals"]; empty: string }) {
  const links = items.flatMap((item) => extractUrls(item.evidence));
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-4">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{empty}</p>
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((item, index) => (
            <div key={`${title}-${index}`}>
              <Badge tone={item.severity} label={prettySeverity(item.severity)} />
              <p className="mt-2 text-sm text-[var(--text-primary)]">{stripSource(item.evidence)}</p>
            </div>
          ))}
        </div>
      )}
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from(new Set(links)).map((href) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--orange)] underline">
              Advisory link
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-dim)] bg-[var(--bg-glass)] p-4">
      <p className="label-sm">{label}</p>
      <p className="mt-2 text-sm text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function severityRank(level: Severity) {
  const ranks: Record<Severity, number> = { clean: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return ranks[level];
}

function prettySeverity(level: Severity) {
  if (level === "clean") return "Low risk";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function severityTone(level: Severity) {
  if (level === "critical" || level === "high") return "urgent";
  if (level === "medium") return "amber";
  return "calm";
}

function isIncidentSignal(signal: ScanReport["signals"][number]) {
  return /incident|affected|sabotage|compromise|protestware|prototype pollution|malicious maintainer|account hijack/i.test(signal.evidence);
}

function extractUrls(value: string) {
  return value.match(/https?:\/\/\S+/g)?.map((url) => url.replace(/[),.]+$/, "")) ?? [];
}

function stripSource(value: string) {
  return value.replace(/\s*Source:\s*https?:\/\/\S+/g, "").trim();
}

function recommendationCopy(level: Severity, packageName: string, version: string) {
  if (level === "critical" || level === "high") {
    return `${packageName}@${version} should be escalated for bonded review before production use. Treat installation as blocked until an agent investigation clears the evidence.`;
  }
  if (level === "medium") {
    return `${packageName}@${version} can move forward only with lockfile pinning, provenance checks, and reviewer sign-off.`;
  }
  return `${packageName}@${version} is acceptable for normal dependency hygiene: pin versions, monitor advisories, and keep update automation active.`;
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
  return value.replace(/_/g, " ");
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
    if (err.status === 402) return "Payment required. Send the 1 USDT scan fee to continue.";
    if (err.status === 404) return "Package not found on npm registry.";
    if (err.status === 408 || err.message.toLowerCase().includes("timed out")) {
      return "Analysis timed out. Try again or use Instant Scan.";
    }
    if (err.status >= 500) return `Server error. ${err.message}`;
    return err.message;
  }

  return err instanceof Error ? err.message : "Unknown error. Try again.";
}
