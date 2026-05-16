import { ethers } from "ethers";
import { CONTRACT_CONFIG, SCAN_FEE_TREASURY_ADDRESS } from "./contractConfig";

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const SCAN_FEE_UNITS = 1_000_000n;

export async function verifyKitePaymentTx(txHash: string, payerAddress?: string): Promise<boolean> {
  if (!ethers.isHexString(txHash, 32)) return false;
  const provider = new ethers.JsonRpcProvider(CONTRACT_CONFIG.rpcUrl);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) return false;

  const tokenAddress = CONTRACT_CONFIG.paymentToken.toLowerCase();
  const treasuryTopic = ethers.zeroPadValue(SCAN_FEE_TREASURY_ADDRESS, 32).toLowerCase();
  const payerTopic = payerAddress && ethers.isAddress(payerAddress)
    ? ethers.zeroPadValue(payerAddress, 32).toLowerCase()
    : null;

  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== tokenAddress) return false;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) return false;
    if (payerTopic && log.topics[1]?.toLowerCase() !== payerTopic) return false;
    if (log.topics[2]?.toLowerCase() !== treasuryTopic) return false;

    try {
      return BigInt(log.data) === SCAN_FEE_UNITS;
    } catch {
      return false;
    }
  });
}
