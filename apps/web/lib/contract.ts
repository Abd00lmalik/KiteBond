import type { InterfaceAbi } from "ethers";
import type { Abi, Address } from "viem";
import HuntRegistryJson from "./abi/KiteBondHuntRegistry.json";
import ScanPaymentsJson from "./abi/KiteBondScanPayments.json";
import ERC20ABIJson from "./abi/ERC20.json";
import { areContractsConfigured } from "./contractConfig";

type AbiArtifact = { abi: unknown };

function extractAbi(json: unknown) {
  return Array.isArray(json) ? json : (json as AbiArtifact).abi;
}

const huntAbiSource = extractAbi(HuntRegistryJson);
const scanAbiSource = extractAbi(ScanPaymentsJson);
const erc20AbiSource = extractAbi(ERC20ABIJson);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const KITE_CHAIN_ID = 2368;
export const KITE_RPC_URL = process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
export const KITE_EXPLORER = process.env.NEXT_PUBLIC_KITE_EXPLORER || "https://testnet.kitescan.ai";

export const HUNT_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_KITEBOND_CONTRACT || ZERO_ADDRESS) as Address;
export const SCAN_PAYMENTS_ADDRESS = (process.env.NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT || ZERO_ADDRESS) as Address;
export const PAYMENT_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_PAYMENT_TOKEN ||
  process.env.NEXT_PUBLIC_TEST_USDT_ADDRESS ||
  "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63") as Address;
export const PROTOCOL_TREASURY = (process.env.NEXT_PUBLIC_PROTOCOL_TREASURY || ZERO_ADDRESS) as Address;

export const KITEBOND_ADDRESS = HUNT_REGISTRY_ADDRESS;
export const KITEBOND_CONTRACT_ADDRESS = HUNT_REGISTRY_ADDRESS;
export const TEST_USDT_ADDRESS = PAYMENT_TOKEN_ADDRESS;
export const isContractConfigured = areContractsConfigured();

export const HuntRegistryABI = huntAbiSource as unknown as Abi;
export const ScanPaymentsABI = scanAbiSource as unknown as Abi;
export const ERC20ABI = erc20AbiSource as unknown as Abi;

export const HuntRegistryEthersABI = huntAbiSource as unknown as InterfaceAbi;
export const ScanPaymentsEthersABI = scanAbiSource as unknown as InterfaceAbi;
export const ERC20EthersABI = erc20AbiSource as unknown as InterfaceAbi;

export const KITEBOND_ABI = HuntRegistryABI;
export const ERC20_ABI = ERC20ABI;

export function txUrl(hash?: string | null) {
  return hash ? `${KITE_EXPLORER}/tx/${hash}` : "";
}

export function addressUrl(address?: string | null) {
  return address ? `${KITE_EXPLORER}/address/${address}` : "";
}
