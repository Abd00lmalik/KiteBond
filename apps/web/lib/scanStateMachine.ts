import type { RiskSignal, Severity } from "./heuristics";

export type ScanDepth = "quick" | "standard" | "deep";

export type ScanState =
  | "idle"
  | "checking_wallet"
  | "checking_network"
  | "checking_free_or_price"
  | "awaiting_usdt_approval"
  | "approval_confirming"
  | "awaiting_scan_authorization"
  | "authorization_confirming"
  | "resolving_package"
  | "inspecting_metadata"
  | "computing_signals"
  | "heurist_analysis"
  | "building_report"
  | "recording_receipt"
  | "completed"
  | "failed";

export type ScanReport = {
  packageName: string;
  version: string;
  riskScore: number;
  riskLevel: Severity;
  summary: string;
  signals: RiskSignal[];
  finalRecommendation: "safe_to_review" | "use_with_caution" | "avoid_until_manual_review";
  confidence: number;
  limitations: string[];
  methodology: string;
  metadata: {
    repository: string | null;
    license: string | null;
    dependencyCount: number;
    hasInstallScripts: boolean;
    publishedAt?: string | null;
    maintainerCount?: number;
  };
};

export interface ScanStateContext {
  state: ScanState;
  packageName: string;
  version: string;
  scanDepth: ScanDepth;
  price: string;
  isFree: boolean;
  paymentTxHash?: string;
  authTxHash?: string;
  report?: ScanReport;
  reportHash?: `0x${string}`;
  scanId?: string;
  onchainScanId?: `0x${string}`;
  receiptTxHash?: string;
  error?: string;
  failedState?: ScanState;
}

export type ScanTransition =
  | { type: "START"; payload: { packageName: string; version: string; scanDepth: ScanDepth } }
  | { type: "WALLET_OK" }
  | { type: "NETWORK_OK" }
  | { type: "PRICE_CHECKED"; payload: { isFree: boolean; price: string } }
  | { type: "APPROVAL_SIGNED"; payload?: { txHash?: string } }
  | { type: "APPROVAL_CONFIRMED"; payload?: { txHash?: string } }
  | { type: "AUTH_SIGNED"; payload?: { txHash?: string } }
  | { type: "AUTH_CONFIRMED"; payload?: { txHash?: string } }
  | { type: "PACKAGE_RESOLVED" }
  | { type: "METADATA_INSPECTED" }
  | { type: "SIGNALS_COMPUTED" }
  | { type: "HEURIST_COMPLETE"; payload?: { partial?: Partial<ScanReport> } }
  | { type: "REPORT_BUILT"; payload: { report: ScanReport; reportHash: `0x${string}`; scanId: string; onchainScanId: `0x${string}` } }
  | { type: "RECORDING_RECEIPT" }
  | { type: "RECEIPT_RECORDED"; payload: { txHash: string; authTxHash?: string } }
  | { type: "ERROR"; payload: { error: string } }
  | { type: "RESET" };

export const initialScanState: ScanStateContext = {
  state: "idle",
  packageName: "",
  version: "latest",
  scanDepth: "quick",
  price: "0",
  isFree: true
};

export function scanReducer(context: ScanStateContext, transition: ScanTransition): ScanStateContext {
  switch (transition.type) {
    case "START":
      return {
        ...initialScanState,
        state: "checking_wallet",
        packageName: transition.payload.packageName,
        version: transition.payload.version,
        scanDepth: transition.payload.scanDepth
      };
    case "WALLET_OK":
      return { ...context, state: "checking_network" };
    case "NETWORK_OK":
      return { ...context, state: "checking_free_or_price" };
    case "PRICE_CHECKED":
      return {
        ...context,
        price: transition.payload.price,
        isFree: transition.payload.isFree,
        state: transition.payload.isFree ? "resolving_package" : "awaiting_usdt_approval"
      };
    case "APPROVAL_SIGNED":
      return { ...context, paymentTxHash: transition.payload?.txHash || context.paymentTxHash, state: "approval_confirming" };
    case "APPROVAL_CONFIRMED":
      return { ...context, paymentTxHash: transition.payload?.txHash || context.paymentTxHash, state: "awaiting_scan_authorization" };
    case "AUTH_SIGNED":
      return { ...context, authTxHash: transition.payload?.txHash || context.authTxHash, state: "authorization_confirming" };
    case "AUTH_CONFIRMED":
      return { ...context, authTxHash: transition.payload?.txHash || context.authTxHash, state: "resolving_package" };
    case "PACKAGE_RESOLVED":
      return { ...context, state: "inspecting_metadata" };
    case "METADATA_INSPECTED":
      return { ...context, state: "computing_signals" };
    case "SIGNALS_COMPUTED":
      return { ...context, state: "heurist_analysis" };
    case "HEURIST_COMPLETE":
      return { ...context, report: { ...context.report, ...transition.payload?.partial } as ScanReport | undefined, state: "building_report" };
    case "REPORT_BUILT":
      return {
        ...context,
        state: "completed",
        report: transition.payload.report,
        reportHash: transition.payload.reportHash,
        scanId: transition.payload.scanId,
        onchainScanId: transition.payload.onchainScanId
      };
    case "RECORDING_RECEIPT":
      return { ...context, state: "recording_receipt" };
    case "RECEIPT_RECORDED":
      return { ...context, state: "completed", receiptTxHash: transition.payload.txHash, authTxHash: transition.payload.authTxHash || context.authTxHash };
    case "ERROR":
      return { ...context, state: "failed", error: transition.payload.error, failedState: context.state };
    case "RESET":
      return initialScanState;
    default:
      return context;
  }
}

export function isScanBusy(state: ScanState) {
  return state !== "idle" && state !== "failed" && state !== "completed";
}
