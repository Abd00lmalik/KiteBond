import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: "../.env.local", override: false });
dotenv.config({ path: "../apps/web/.env.local", override: false });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    kiteTestnet: {
      url: process.env.NEXT_PUBLIC_KITE_RPC_URL || process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/",
      chainId: 2368,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : []
    }
  }
};

export default config;
