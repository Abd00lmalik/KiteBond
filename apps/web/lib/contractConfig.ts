import { isAddress, zeroAddress } from "viem";

const ENV = {
  NEXT_PUBLIC_KITEBOND_CONTRACT: process.env.NEXT_PUBLIC_KITEBOND_CONTRACT,
  NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT: process.env.NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT,
  NEXT_PUBLIC_PAYMENT_TOKEN: process.env.NEXT_PUBLIC_PAYMENT_TOKEN,
  NEXT_PUBLIC_PROTOCOL_TREASURY: process.env.NEXT_PUBLIC_PROTOCOL_TREASURY,
  NEXT_PUBLIC_KITE_CHAIN_ID: process.env.NEXT_PUBLIC_KITE_CHAIN_ID,
  NEXT_PUBLIC_KITE_RPC_URL: process.env.NEXT_PUBLIC_KITE_RPC_URL,
  NEXT_PUBLIC_KITE_EXPLORER: process.env.NEXT_PUBLIC_KITE_EXPLORER,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
} as const;

export const SCAN_FEE_TREASURY_ADDRESS = "0x25265b9dBEb6c653b0CA281110Bb0697a9685107" as const;

type EnvKey = keyof typeof ENV;

function readEnv(key: EnvKey): string {
  const val = ENV[key]?.trim() || "";
  return val.replace(/['"]/g, "");
}

function isConfiguredAddress(value: string): boolean {
  return Boolean(value && isAddress(value) && value !== zeroAddress);
}

export const CONTRACT_CONFIG = {
  kitebond: readEnv("NEXT_PUBLIC_KITEBOND_CONTRACT") as `0x${string}`,
  scanPayments: readEnv("NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT") as `0x${string}`,
  paymentToken: readEnv("NEXT_PUBLIC_PAYMENT_TOKEN") as `0x${string}`,
  treasury: SCAN_FEE_TREASURY_ADDRESS,
  chainId: Number(readEnv("NEXT_PUBLIC_KITE_CHAIN_ID")),
  rpcUrl: readEnv("NEXT_PUBLIC_KITE_RPC_URL"),
  explorerUrl: readEnv("NEXT_PUBLIC_KITE_EXPLORER"),
  appUrl: readEnv("NEXT_PUBLIC_APP_URL")
} as const;

export function getScanPaymentsAddress(): `0x${string}` {
  return CONTRACT_CONFIG.scanPayments;
}

export function getHuntRegistryAddress(): `0x${string}` {
  return CONTRACT_CONFIG.kitebond;
}

export function getPaymentTokenAddress(): `0x${string}` {
  return CONTRACT_CONFIG.paymentToken;
}

export function getProtocolTreasuryAddress(): `0x${string}` {
  return SCAN_FEE_TREASURY_ADDRESS;
}

export function tryGetScanPaymentsAddress(): `0x${string}` | null {
  return CONTRACT_CONFIG.scanPayments;
}

export function tryGetHuntRegistryAddress(): `0x${string}` | null {
  return CONTRACT_CONFIG.kitebond;
}

export function tryGetPaymentTokenAddress(): `0x${string}` | null {
  return CONTRACT_CONFIG.paymentToken;
}

export function getMissingContractConfig(): string[] {
  const missing: string[] = [];
  if (!isConfiguredAddress(CONTRACT_CONFIG.kitebond)) missing.push("NEXT_PUBLIC_KITEBOND_CONTRACT");
  if (!isConfiguredAddress(CONTRACT_CONFIG.scanPayments)) missing.push("NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT");
  if (!isConfiguredAddress(CONTRACT_CONFIG.paymentToken)) missing.push("NEXT_PUBLIC_PAYMENT_TOKEN");
  if (!Number.isFinite(CONTRACT_CONFIG.chainId) || CONTRACT_CONFIG.chainId <= 0) missing.push("NEXT_PUBLIC_KITE_CHAIN_ID");
  if (!CONTRACT_CONFIG.rpcUrl) missing.push("NEXT_PUBLIC_KITE_RPC_URL");
  if (!CONTRACT_CONFIG.explorerUrl) missing.push("NEXT_PUBLIC_KITE_EXPLORER");
  if (!CONTRACT_CONFIG.appUrl) missing.push("NEXT_PUBLIC_APP_URL");
  return missing;
}

export function areContractsConfigured(): boolean {
  return getMissingContractConfig().length === 0;
}
