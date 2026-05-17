import { formatUnits, Interface, JsonRpcProvider } from "ethers";
import { CONTRACT_CONFIG } from "@/lib/contractConfig";
import { HuntRegistryEthersABI } from "@/lib/contract";

export interface DecodedHuntCreation {
  txHash: string;
  blockNumber: number | null;
  contractAddress: string | null;
  onChainId: number | null;
  creatorAddress: string | null;
  rewardAmount: string | null;
  stakeRequired: string | null;
  deadlineIso: string | null;
  deadlineDurationSeconds: number | null;
  packageNameHash: string | null;
  versionHash: string | null;
  termsHash: string | null;
  scanDepth: string | null;
  rawLogCount: number;
  decodeLog: string[];
}

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

function parseInt32Safe(value: bigint | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  let asNumber: number;
  try {
    asNumber = typeof value === "bigint" ? Number(value) : Number(value);
  } catch {
    return null;
  }
  if (!Number.isFinite(asNumber)) return null;
  if (Math.trunc(asNumber) !== asNumber) return null;
  if (asNumber < INT32_MIN || asNumber > INT32_MAX) return null;
  return asNumber;
}

function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("0x")) return null;
  return trimmed.toLowerCase();
}

function normalizeBytes32(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function scanDepthFromEnum(value: unknown): string | null {
  const asNumber = parseInt32Safe(value as bigint | number | string | null | undefined);
  if (asNumber === 0) return "instant";
  if (asNumber === 1) return "standard";
  if (asNumber === 2) return "deep";
  return null;
}

function shortHashLabel(prefix: string, hash: string | null) {
  if (!hash) return "unknown";
  return `${prefix}:${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function decodeHuntCreatedFromTx(txHash: string): Promise<DecodedHuntCreation> {
  const provider = new JsonRpcProvider(CONTRACT_CONFIG.rpcUrl);
  let receipt = await provider.getTransactionReceipt(txHash);
  for (let attempt = 0; !receipt && attempt < 3; attempt += 1) {
    await wait(1200);
    receipt = await provider.getTransactionReceipt(txHash);
  }
  if (!receipt) {
    throw new Error("Transaction receipt not found yet.");
  }
  const tx = await provider.getTransaction(txHash);

  const iface = new Interface(HuntRegistryEthersABI);
  const contractAddress = normalizeAddress(CONTRACT_CONFIG.kitebond);
  const out: DecodedHuntCreation = {
    txHash,
    blockNumber: receipt.blockNumber ? Number(receipt.blockNumber) : null,
    contractAddress,
    onChainId: null,
    creatorAddress: null,
    rewardAmount: null,
    stakeRequired: null,
    deadlineIso: null,
    deadlineDurationSeconds: null,
    packageNameHash: null,
    versionHash: null,
    termsHash: null,
    scanDepth: null,
    rawLogCount: receipt.logs.length,
    decodeLog: []
  };

  if (tx?.data) {
    try {
      const parsedTx = iface.parseTransaction({ data: tx.data, value: tx.value });
      if (parsedTx?.name === "createHunt") {
        out.packageNameHash = normalizeBytes32(parsedTx.args.packageNameHash ?? parsedTx.args[0]) ?? out.packageNameHash;
        out.versionHash = normalizeBytes32(parsedTx.args.versionHash ?? parsedTx.args[1]) ?? out.versionHash;
        out.termsHash = normalizeBytes32(parsedTx.args.termsHash ?? parsedTx.args[2]) ?? out.termsHash;
        out.scanDepth = scanDepthFromEnum(parsedTx.args.scanDepth ?? parsedTx.args[3]) ?? out.scanDepth;
        out.rewardAmount = parsedTx.args.rewardAmount !== undefined ? formatUnits(parsedTx.args.rewardAmount, 18) : out.rewardAmount;
        out.stakeRequired = parsedTx.args.stakeRequired !== undefined ? formatUnits(parsedTx.args.stakeRequired, 18) : out.stakeRequired;
        out.deadlineDurationSeconds = parseInt32Safe(parsedTx.args.deadlineDuration ?? parsedTx.args[6]);
        out.decodeLog.push("Decoded createHunt transaction input.");
      }
    } catch (error) {
      out.decodeLog.push(`Transaction input decode failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const log of receipt.logs) {
    try {
      const logAddress = normalizeAddress(log.address);
      if (contractAddress && logAddress !== contractAddress) {
        continue;
      }
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) continue;
      if (parsed.name !== "HuntCreated") continue;

      const onChainId = parseInt32Safe(parsed.args.huntId ?? parsed.args[0]);
      out.onChainId = onChainId;
      out.creatorAddress = normalizeAddress(String(parsed.args.creator ?? parsed.args[1] ?? "")) ?? out.creatorAddress;
      out.packageNameHash = normalizeBytes32(parsed.args.packageNameHash) ?? out.packageNameHash;
      out.rewardAmount = parsed.args.rewardAmount !== undefined ? formatUnits(parsed.args.rewardAmount, 18) : out.rewardAmount;
      out.stakeRequired = parsed.args.stakeRequired !== undefined ? formatUnits(parsed.args.stakeRequired, 18) : out.stakeRequired;
      const deadlineValue = parsed.args.deadline !== undefined ? Number(parsed.args.deadline) : NaN;
      if (Number.isFinite(deadlineValue) && deadlineValue > 0) {
        out.deadlineIso = new Date(deadlineValue * 1000).toISOString();
      }
      out.decodeLog.push(`Decoded HuntCreated from ${log.address}`);
      return out;
    } catch (error) {
      out.decodeLog.push(error instanceof Error ? error.message : String(error));
    }
  }

  out.decodeLog.push("No HuntCreated event decoded from receipt logs.");
  return out;
}

export function coerceOnChainId(value: unknown): number | null {
  return parseInt32Safe(value as bigint | number | string | null | undefined);
}

export function fallbackPackageLabel(packageNameHash: string | null) {
  return shortHashLabel("package-hash", packageNameHash);
}

export function fallbackVersionLabel(versionHash: string | null) {
  return shortHashLabel("version-hash", versionHash);
}
