import { NextResponse } from "next/server";
import {
  HUNT_REGISTRY_ADDRESS,
  KITE_EXPLORER,
  KITE_RPC_URL,
  PAYMENT_TOKEN_ADDRESS,
  PROTOCOL_TREASURY,
  SCAN_PAYMENTS_ADDRESS
} from "@/lib/contract";
import { CONTRACT_CONFIG } from "@/lib/contractConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      network: {
        chainId: 2368,
        name: "KiteAI Testnet",
        rpc: KITE_RPC_URL,
        explorer: KITE_EXPLORER
      },
      contracts: {
        huntRegistry: HUNT_REGISTRY_ADDRESS,
        scanPayments: SCAN_PAYMENTS_ADDRESS,
        paymentToken: PAYMENT_TOKEN_ADDRESS,
        treasury: PROTOCOL_TREASURY
      },
      abis: {
        huntRegistry: "/api/agent/abi/hunt-registry",
        scanPayments: "/api/agent/abi/scan-payments"
      },
      pricing: {
        quickScan: "0",
        standardScan: "1000000000000000000",
        deepScan: "3000000000000000000"
      },
      skillDoc: "/skill.md",
      skillPage: "/app/skill",
      apiBase: CONTRACT_CONFIG.appUrl
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load agent config", code: "AGENT_CONFIG_ERROR" },
      { status: 500 }
    );
  }
}
