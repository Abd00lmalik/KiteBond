import type { InterfaceAbi } from "ethers";
import type { Abi, Address } from "viem";
import HuntRegistryJson from "./abi/KiteBondHuntRegistry.json";
import ScanPaymentsJson from "./abi/KiteBondScanPayments.json";
import ERC20ABIJson from "./abi/ERC20.json";
import { CONTRACT_CONFIG, areContractsConfigured } from "./contractConfig";

type AbiArtifact = { abi: unknown };

function extractAbi(json: unknown) {
  return Array.isArray(json) ? json : (json as AbiArtifact).abi;
}

const huntAbiSource = extractAbi(HuntRegistryJson);
const scanAbiSource = extractAbi(ScanPaymentsJson);
const erc20AbiSource = extractAbi(ERC20ABIJson);

export const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

export const KITE_CHAIN_ID = 2368;
export const KITE_RPC_URL = CONTRACT_CONFIG.rpcUrl;
export const KITE_EXPLORER = CONTRACT_CONFIG.explorerUrl;

export const HUNT_REGISTRY_ADDRESS = CONTRACT_CONFIG.kitebond as Address;
export const SCAN_PAYMENTS_ADDRESS = CONTRACT_CONFIG.scanPayments as Address;
export const PAYMENT_TOKEN_ADDRESS = CONTRACT_CONFIG.paymentToken as Address;
export const PROTOCOL_TREASURY = CONTRACT_CONFIG.treasury as Address;

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
