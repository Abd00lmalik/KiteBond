import { ethers } from "ethers";
import { KITE_RPC_URL } from "@/lib/contract";

export function getVerifierProvider() {
  return new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_KITE_RPC_URL || KITE_RPC_URL);
}

export function getVerifierWallet(provider = getVerifierProvider()): ethers.Wallet {
  const key = process.env.VERIFIER_AGENT_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("No verifier key. Set VERIFIER_AGENT_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY.");
  if (!process.env.VERIFIER_AGENT_PRIVATE_KEY) {
    console.warn("[KiteBond] Using DEPLOYER_PRIVATE_KEY as verifier fallback. Set VERIFIER_AGENT_PRIVATE_KEY for production.");
  }
  return new ethers.Wallet(key, provider);
}
