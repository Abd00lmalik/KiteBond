const KITE_AA_BUNDLER = "https://bundler-service.staging.gokite.ai/rpc/";

export type KiteAAWalletInfo = {
  mode: "aa-sdk" | "fallback";
  address?: string;
  note: string;
};

export async function createKiteAASDK() {
  const { KITE_RPC_URL } = await import("@/lib/contract");
  const mod = await import("gokite-aa-sdk");
  const { GokiteAASDK } = mod as unknown as {
    GokiteAASDK: new (network: string, rpcUrl: string, bundlerUrl: string) => unknown;
  };

  return new GokiteAASDK(
    "kite_testnet",
    KITE_RPC_URL,
    KITE_AA_BUNDLER
  );
}

export async function describeAgentWallet(): Promise<KiteAAWalletInfo> {
  try {
    await createKiteAASDK();
    return {
      mode: "aa-sdk",
      note: "Kite AA SDK initialized for server-side agent wallet support."
    };
  } catch {
    return {
      mode: "fallback",
      note: "Using EOA signer fallback for agent transactions."
    };
  }
}
