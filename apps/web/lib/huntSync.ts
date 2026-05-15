import { Interface, JsonRpcProvider } from "ethers";
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
  packageNameHash: string | null;
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

export async function decodeHuntCreatedFromTx(txHash: string): Promise<DecodedHuntCreation> {
  const provider = new JsonRpcProvider(CONTRACT_CONFIG.rpcUrl);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error("Transaction receipt not found yet.");
  }

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
    packageNameHash: null,
    rawLogCount: receipt.logs.length,
    decodeLog: []
  };

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
      out.packageNameHash = typeof parsed.args.packageNameHash === "string" ? parsed.args.packageNameHash : null;
      out.rewardAmount = parsed.args.rewardAmount !== undefined ? String(parsed.args.rewardAmount) : null;
      out.stakeRequired = parsed.args.stakeRequired !== undefined ? String(parsed.args.stakeRequired) : null;
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
