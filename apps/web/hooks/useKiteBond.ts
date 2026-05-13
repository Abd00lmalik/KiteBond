"use client";

import { useCallback } from "react";
import { isAddress, parseEventLogs, parseUnits, zeroAddress } from "viem";
import { usePublicClient, useReadContract, useWriteContract } from "wagmi";
import {
  ERC20ABI,
  HuntRegistryABI,
  ScanPaymentsABI
} from "@/lib/contract";
import {
  getHuntRegistryAddress,
  getPaymentTokenAddress,
  getScanPaymentsAddress,
  tryGetScanPaymentsAddress
} from "@/lib/contractConfig";

export type ScanDepth = "quick" | "standard" | "deep";

const depthToEnum: Record<ScanDepth, number> = {
  quick: 0,
  standard: 1,
  deep: 2
};

export function useApproveToken() {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  const approve = useCallback(
    async ({ spender, amount }: { spender: `0x${string}`; amount: string }) => {
      if (!publicClient) throw new Error("Wallet client is not ready");
      if (!isAddress(spender) || spender === zeroAddress) {
        throw new Error(`Invalid spender address: ${spender}`);
      }
      const hash = await writeContractAsync({
        address: getPaymentTokenAddress(),
        abi: ERC20ABI,
        functionName: "approve",
        args: [spender, parseUnits(amount, 18)]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [publicClient, writeContractAsync]
  );

  return { approve, isApproving: isPending };
}

export function useAuthorizeScan() {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  const authorizeScan = useCallback(
    async ({
      packageNameHash,
      versionHash,
      depth,
      scanId
    }: {
      packageNameHash: `0x${string}`;
      versionHash: `0x${string}`;
      depth: ScanDepth;
      scanId: `0x${string}`;
    }) => {
      if (!publicClient) throw new Error("Wallet client is not ready");
      const hash = await writeContractAsync({
        address: getScanPaymentsAddress(),
        abi: ScanPaymentsABI,
        functionName: "authorizeScan",
        args: [packageNameHash, versionHash, depthToEnum[depth], scanId]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [publicClient, writeContractAsync]
  );

  return { authorizeScan, isAuthorizing: isPending };
}

export function useAnchorScanProof() {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  const anchorProof = useCallback(
    async ({ scanId, reportHash }: { scanId: `0x${string}`; reportHash: `0x${string}` }) => {
      if (!publicClient) throw new Error("Wallet client is not ready");
      const hash = await writeContractAsync({
        address: getScanPaymentsAddress(),
        abi: ScanPaymentsABI,
        functionName: "anchorProof",
        args: [scanId, reportHash]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [publicClient, writeContractAsync]
  );

  return { anchorProof, isAnchoring: isPending };
}

export function useRecordScanReceipt() {
  const { anchorProof, isAnchoring } = useAnchorScanProof();
  return { recordReceipt: anchorProof, isRecordingReceipt: isAnchoring };
}

export function useCreateHunt() {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  const createHunt = useCallback(
    async ({
      packageNameHash,
      versionHash,
      termsHash,
      scanDepth = "quick",
      rewardAmount,
      stakeRequired,
      deadlineSeconds
    }: {
      packageNameHash: `0x${string}`;
      versionHash: `0x${string}`;
      termsHash: `0x${string}`;
      scanDepth?: ScanDepth;
      rewardAmount: string;
      stakeRequired: string;
      deadlineSeconds: number;
    }) => {
      if (!publicClient) throw new Error("Wallet client is not ready");
      const hash = await writeContractAsync({
        address: getHuntRegistryAddress(),
        abi: HuntRegistryABI,
        functionName: "createHunt",
        args: [
          packageNameHash,
          versionHash,
          termsHash,
          depthToEnum[scanDepth],
          parseUnits(rewardAmount, 18),
          parseUnits(stakeRequired, 18),
          BigInt(deadlineSeconds)
        ]
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = parseEventLogs({
        abi: HuntRegistryABI,
        logs: receipt.logs,
        eventName: "HuntCreated",
        strict: false
      });
      const event = events[0] as { args?: { huntId?: bigint } } | undefined;
      const huntId = event?.args?.huntId;
      if (huntId === undefined) throw new Error("HuntCreated event not found in transaction receipt");
      return { hash, chainHuntId: Number(huntId) };
    },
    [publicClient, writeContractAsync]
  );

  return { createHunt, isCreating: isPending };
}

export function useStakeAndJoin() {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  const stakeAndJoin = useCallback(
    async ({ chainHuntId }: { chainHuntId: number }) => {
      if (!publicClient) throw new Error("Wallet client is not ready");
      const hash = await writeContractAsync({
        address: getHuntRegistryAddress(),
        abi: HuntRegistryABI,
        functionName: "stakeAndJoin",
        args: [BigInt(chainHuntId)]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [publicClient, writeContractAsync]
  );

  return { stakeAndJoin, isStaking: isPending };
}

export function useSubmitReportOnChain() {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  const submitReport = useCallback(
    async ({ chainHuntId, reportHash }: { chainHuntId: number; reportHash: `0x${string}` }) => {
      if (!publicClient) throw new Error("Wallet client is not ready");
      const hash = await writeContractAsync({
        address: getHuntRegistryAddress(),
        abi: HuntRegistryABI,
        functionName: "submitReport",
        args: [BigInt(chainHuntId), reportHash]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [publicClient, writeContractAsync]
  );

  return { submitReport, isSubmitting: isPending };
}

export function useSelectWinner() {
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  const selectWinner = useCallback(
    async ({ chainHuntId, submissionIndex }: { chainHuntId: number; submissionIndex: number }) => {
      if (!publicClient) throw new Error("Wallet client is not ready");
      const hash = await writeContractAsync({
        address: getHuntRegistryAddress(),
        abi: HuntRegistryABI,
        functionName: "selectWinner",
        args: [BigInt(chainHuntId), BigInt(submissionIndex)]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    [publicClient, writeContractAsync]
  );

  return { selectWinner, isSelecting: isPending };
}

export function useUsedFreeScan(address?: `0x${string}`) {
  const scanPaymentsAddress = tryGetScanPaymentsAddress();
  return useReadContract({
    address: (scanPaymentsAddress || zeroAddress) as `0x${string}`,
    abi: ScanPaymentsABI,
    functionName: "usedFreeScan",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && scanPaymentsAddress) }
  });
}
