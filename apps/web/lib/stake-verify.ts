import { createPublicClient, http } from "viem";
import { kiteTestnet } from "./wagmi";
import { HUNT_REGISTRY_ADDRESS, KITE_RPC_URL } from "./contract";

const HAS_STAKED_ABI = [
  {
    name: "hasStaked",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "huntId", type: "uint256" },
      { name: "agent", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

export async function verifyOnChainStake(
  chainHuntId: number | null | undefined,
  agentAddress: string
): Promise<boolean> {
  if (chainHuntId === null || chainHuntId === undefined || !HUNT_REGISTRY_ADDRESS) {
    console.warn("[StakeVerify] Missing chainHuntId or contract address");
    return false;
  }

  try {
    const client = createPublicClient({
      chain: kiteTestnet,
      transport: http(KITE_RPC_URL)
    });

    const result = await client.readContract({
      address: HUNT_REGISTRY_ADDRESS as `0x${string}`,
      abi: HAS_STAKED_ABI,
      functionName: "hasStaked",
      args: [BigInt(chainHuntId), agentAddress as `0x${string}`]
    });

    return Boolean(result);
  } catch (err) {
    console.error("[StakeVerify] Failed to verify stake on chain:", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
