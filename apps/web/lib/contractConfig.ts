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

type EnvKey = keyof typeof ENV;

function requireEnv(key: EnvKey): string {
  const val = ENV[key];
  if (!val || val.trim() === "" || val.includes("undefined")) {
    console.warn(`[KiteBond] Missing env variable: ${key}`);
    if (key.includes("CONTRACT") || key.includes("TOKEN") || key.includes("TREASURY")) {
      return zeroAddress;
    }
    return "";
  }

  if (key.includes("CONTRACT") || key.includes("TOKEN") || key.includes("TREASURY")) {
    const clean = val.trim().replace(/['"]/g, "");
    if (!isAddress(clean)) {
      console.warn(`[KiteBond] Invalid address for ${key}: "${clean}"`);
      return zeroAddress;
    }
    return clean;
  }

  return val.trim().replace(/^['"]|['"]$/g, "");
}

export const CONTRACT_CONFIG = {
  kitebond: requireEnv("NEXT_PUBLIC_KITEBOND_CONTRACT") as `0x${string}`,
  scanPayments: requireEnv("NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT") as `0x${string}`,
  paymentToken: requireEnv("NEXT_PUBLIC_PAYMENT_TOKEN") as `0x${string}`,
  treasury: requireEnv("NEXT_PUBLIC_PROTOCOL_TREASURY") as `0x${string}`,
  chainId: Number(requireEnv("NEXT_PUBLIC_KITE_CHAIN_ID")) || 2368,
  rpcUrl: requireEnv("NEXT_PUBLIC_KITE_RPC_URL"),
  explorerUrl: requireEnv("NEXT_PUBLIC_KITE_EXPLORER"),
  appUrl: requireEnv("NEXT_PUBLIC_APP_URL")
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

export function tryGetScanPaymentsAddress(): `0x${string}` | null {
  return CONTRACT_CONFIG.scanPayments !== zeroAddress ? CONTRACT_CONFIG.scanPayments : null;
}

export function tryGetHuntRegistryAddress(): `0x${string}` | null {
  return CONTRACT_CONFIG.kitebond !== zeroAddress ? CONTRACT_CONFIG.kitebond : null;
}

export function tryGetPaymentTokenAddress(): `0x${string}` | null {
  return CONTRACT_CONFIG.paymentToken !== zeroAddress ? CONTRACT_CONFIG.paymentToken : null;
}

export function getMissingContractConfig(): string[] {
  const missing: string[] = [];
  const keys: EnvKey[] = [
    "NEXT_PUBLIC_KITEBOND_CONTRACT",
    "NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT",
    "NEXT_PUBLIC_PAYMENT_TOKEN",
    "NEXT_PUBLIC_PROTOCOL_TREASURY",
    "NEXT_PUBLIC_KITE_CHAIN_ID",
    "NEXT_PUBLIC_KITE_RPC_URL",
    "NEXT_PUBLIC_KITE_EXPLORER",
    "NEXT_PUBLIC_APP_URL"
  ];
  for (const key of keys) {
    const val = ENV[key];
    if (!val || val.trim() === "" || val.includes("undefined")) {
      missing.push(key);
    }
  }
  return missing;
}

export function areContractsConfigured(): boolean {
  return getMissingContractConfig().length === 0;
}
