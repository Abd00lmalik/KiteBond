import { createPublicClient, http, decodeFunctionData } from "viem";
import { kiteTestnet } from "./wagmi";
import { HUNT_REGISTRY_ADDRESS, KITE_RPC_URL, HuntRegistryABI } from "./contract";

export type VerifyResult =
  | { ok: true; decodedHuntId: bigint; decodedSubmissionIndex: bigint }
  | { ok: false; reason: string; detail?: string };

export async function verifySelectWinnerTx(
  txHash: `0x${string}`,
  expectedCreatorAddress: string,
  expectedChainHuntId: number | null
): Promise<VerifyResult> {
  const client = createPublicClient({ chain: kiteTestnet, transport: http(KITE_RPC_URL) });
  const expectedContract = HUNT_REGISTRY_ADDRESS.toLowerCase();

  // Step 1: Fetch receipt with retry (3 attempts, 3s apart)
  let receipt = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash });
      if (receipt) break;
    } catch {
      // not indexed yet
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 3000));
  }

  if (!receipt) {
    return { ok: false, reason: "receipt_not_found", detail: "Transaction not yet indexed. Retry in a few seconds." };
  }

  // Step 2: Check receipt status
  if (receipt.status !== "success") {
    return { ok: false, reason: "tx_reverted", detail: "Transaction was reverted on-chain." };
  }

  // Step 3: Check contract address
  if (!expectedContract || expectedContract === "0x0000000000000000000000000000000000000000") {
    return { ok: false, reason: "config_error", detail: `Contract address not configured (got: ${expectedContract})` };
  }
  if (receipt.to?.toLowerCase() !== expectedContract) {
    return {
      ok: false,
      reason: "wrong_contract",
      detail: `Expected ${expectedContract}, got ${receipt.to?.toLowerCase()}`
    };
  }

  // Step 4: Check sender (creator)
  if (receipt.from.toLowerCase() !== expectedCreatorAddress.toLowerCase()) {
    return {
      ok: false,
      reason: "wrong_sender",
      detail: `Expected creator ${expectedCreatorAddress.toLowerCase()}, got ${receipt.from.toLowerCase()}`
    };
  }

  // Step 5: Fetch full transaction for calldata
  let tx = null;
  try {
    tx = await client.getTransaction({ hash: txHash });
  } catch (err) {
    return { ok: false, reason: "tx_fetch_failed", detail: err instanceof Error ? err.message : String(err) };
  }

  // Step 6: Decode calldata
  let decoded: { functionName: string; args?: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: HuntRegistryABI, data: tx.input });
  } catch (err) {
    return {
      ok: false,
      reason: "calldata_decode_failed",
      detail: err instanceof Error ? err.message : "Could not decode transaction input."
    };
  }

  // Step 7: Verify function name
  if (decoded.functionName !== "selectWinner") {
    return {
      ok: false,
      reason: "wrong_function",
      detail: `Expected selectWinner, got ${decoded.functionName}`
    };
  }

  // Step 8: Extract args — selectWinner(uint256 huntId, uint256 submissionIndex)
  if (!decoded.args || decoded.args.length < 2) {
    return { ok: false, reason: "calldata_decode_failed", detail: "selectWinner args missing from decoded calldata." };
  }
  const [decodedHuntId, decodedSubmissionIndex] = decoded.args as [bigint, bigint];

  // Step 9: Verify hunt ID
  if (expectedChainHuntId !== null) {
    if (decodedHuntId !== BigInt(expectedChainHuntId)) {
      return {
        ok: false,
        reason: "hunt_id_mismatch",
        detail: `Expected chain hunt ID ${expectedChainHuntId}, decoded ${decodedHuntId.toString()}`
      };
    }
  }

  // Step 10: Optional WinnerSelected event check (not required — calldata is the source of truth)
  const hasWinnerEvent = receipt.logs.some(log => log.address.toLowerCase() === expectedContract);
  if (!hasWinnerEvent) {
    console.log("[SelectWinner][verify] No WinnerSelected event in logs — calldata verification is sufficient");
  }

  return { ok: true, decodedHuntId, decodedSubmissionIndex };
}
