"use client";

import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet
} from "@rainbow-me/rainbowkit/wallets";
export const kiteTestnet = defineChain({
  id: 2368,
  name: "KiteAI Testnet",
  nativeCurrency: { name: "KITE", symbol: "KITE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-testnet.gokite.ai/"] }
  },
  blockExplorers: {
    default: { name: "KiteScan", url: "https://testnet.kitescan.ai" }
  },
  testnet: true
});

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "kitebond-walletconnect-project";

const connectors = connectorsForWallets(
  [
    {
      groupName: "KiteBond",
      wallets: [injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet]
    }
  ],
  {
    appName: "KiteBond",
    projectId
  }
);

export const wagmiConfig = createConfig({
  chains: [kiteTestnet],
  connectors,
  transports: {
    [kiteTestnet.id]: http("https://rpc-testnet.gokite.ai/")
  },
  ssr: true
});
