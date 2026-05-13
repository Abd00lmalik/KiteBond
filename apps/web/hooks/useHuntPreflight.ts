"use client";

import { useMemo } from "react";
import { useAccount, useBalance, useChainId, useReadContract } from "wagmi";
import { formatUnits, parseEther, parseUnits } from "viem";
import { ERC20ABI } from "@/lib/contract";
import { areContractsConfigured, getPaymentTokenAddress } from "@/lib/contractConfig";

type PreflightParams = {
  rewardAmount?: string;
  stakeAmount?: string;
};

export function useHuntPreflight(params: PreflightParams = {}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractsConfigured = areContractsConfigured();

  const { data: kiteBalance } = useBalance({ address });
  const paymentToken = useMemo(() => {
    try {
      return getPaymentTokenAddress();
    } catch {
      return null;
    }
  }, []);

  const { data: usdtBalance } = useReadContract({
    address: (paymentToken || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && paymentToken) }
  });
  const normalizedUsdtBalance = typeof usdtBalance === "bigint" ? usdtBalance : 0n;

  const rewardWei = useMemo(() => {
    try {
      return parseUnits(params.rewardAmount || "0", 18);
    } catch {
      return 0n;
    }
  }, [params.rewardAmount]);

  const stakeWei = useMemo(() => {
    try {
      return parseUnits(params.stakeAmount || "0", 18);
    } catch {
      return 0n;
    }
  }, [params.stakeAmount]);

  const hasEnoughUsdtForReward = normalizedUsdtBalance >= rewardWei;
  const hasEnoughUsdtForStake = normalizedUsdtBalance >= stakeWei;
  const hasKiteForGas = kiteBalance ? kiteBalance.value > parseEther("0.001") : true;

  const errors = [
    !isConnected ? "Connect your wallet" : null,
    chainId !== 2368 ? "Switch to KiteAI Testnet" : null,
    !contractsConfigured ? "Contracts not deployed or not configured" : null
  ].filter(Boolean) as string[];

  return {
    address,
    walletConnected: isConnected,
    correctNetwork: chainId === 2368,
    contractsConfigured,
    errors,
    usdtBalance: normalizedUsdtBalance,
    kiteBalance,
    hasEnoughUsdtForReward,
    hasEnoughUsdtForStake,
    hasKiteForGas,
    formattedUsdtBalance: Number(formatUnits(normalizedUsdtBalance, 18)).toFixed(4),
    formattedKiteBalance: kiteBalance ? Number(formatUnits(kiteBalance.value, kiteBalance.decimals)).toFixed(4) : "0.0000"
  };
}
