import { isAddress, zeroAddress } from "viem";

function requireAddress(value: string | undefined, label: string): `0x${string}` {
  if (!value || !isAddress(value) || value === zeroAddress) {
    throw new Error(`${label} not configured. Set the required NEXT_PUBLIC contract address in apps/web/.env.local.`);
  }
  return value as `0x${string}`;
}

function optionalAddress(value: string | undefined): `0x${string}` | null {
  if (!value || !isAddress(value) || value === zeroAddress) return null;
  return value as `0x${string}`;
}

export function getScanPaymentsAddress(): `0x${string}` {
  return requireAddress(process.env.NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT, "Scan payments contract");
}

export function getHuntRegistryAddress(): `0x${string}` {
  return requireAddress(process.env.NEXT_PUBLIC_KITEBOND_CONTRACT, "Hunt registry contract");
}

export function getPaymentTokenAddress(): `0x${string}` {
  return requireAddress(
    process.env.NEXT_PUBLIC_PAYMENT_TOKEN || process.env.NEXT_PUBLIC_TEST_USDT_ADDRESS,
    "Payment token"
  );
}

export function tryGetScanPaymentsAddress(): `0x${string}` | null {
  return optionalAddress(process.env.NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT);
}

export function tryGetHuntRegistryAddress(): `0x${string}` | null {
  return optionalAddress(process.env.NEXT_PUBLIC_KITEBOND_CONTRACT);
}

export function tryGetPaymentTokenAddress(): `0x${string}` | null {
  return optionalAddress(process.env.NEXT_PUBLIC_PAYMENT_TOKEN || process.env.NEXT_PUBLIC_TEST_USDT_ADDRESS);
}

export function getMissingContractConfig(): string[] {
  const missing: string[] = [];
  if (!tryGetScanPaymentsAddress()) missing.push("NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT");
  if (!tryGetHuntRegistryAddress()) missing.push("NEXT_PUBLIC_KITEBOND_CONTRACT");
  if (!tryGetPaymentTokenAddress()) missing.push("NEXT_PUBLIC_PAYMENT_TOKEN");
  return missing;
}

export function areContractsConfigured(): boolean {
  return getMissingContractConfig().length === 0;
}
