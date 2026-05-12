"use client";

import { useChainId, useSwitchChain } from "wagmi";

export function useNetworkGuard() {
  const chainId = useChainId();
  const { switchChain, isPending, error } = useSwitchChain();
  const isCorrectNetwork = chainId === 2368;

  function switchToKite() {
    switchChain({ chainId: 2368 });
  }

  return {
    chainId,
    isCorrectNetwork,
    isWrongNetwork: !isCorrectNetwork,
    isSwitching: isPending,
    switchToKite,
    error
  };
}
