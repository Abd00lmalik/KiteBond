import { ethers } from "ethers";
import { CONTRACT_CONFIG } from "./contractConfig";

export async function verifyKitePaymentTx(txHash: string): Promise<boolean> {
  if (!ethers.isHexString(txHash, 32)) return false;
  const provider = new ethers.JsonRpcProvider(CONTRACT_CONFIG.rpcUrl);
  const receipt = await provider.getTransactionReceipt(txHash);
  return Boolean(receipt && receipt.status === 1);
}
