/**
 * Creates a fresh small on-chain hunt for agent participation testing.
 * Usage: npm run agent:create-test-hunt
 *
 * Creates a throwaway creator wallet, funds it from DEPLOYER_PRIVATE_KEY,
 * creates a colors@1.4.0 hunt, and writes the hunt to the app database via API.
 * The throwaway private key is never printed.
 */

import * as dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: "apps/web/.env.local", override: false });

const HUNT_REGISTRY_ABI_MINIMAL = [
  "event HuntCreated(uint256 indexed huntId, address indexed creator, bytes32 packageNameHash, uint256 rewardAmount, uint256 stakeRequired, uint256 deadline, uint256 timestamp)",
  "function createHunt(bytes32 packageNameHash, bytes32 versionHash, bytes32 termsHash, uint8 scanDepth, uint256 rewardAmount, uint256 stakeRequired, uint256 deadlineDuration) external returns (uint256 huntId)"
];

const ERC20_ABI_MINIMAL = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)"
];

async function main() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
  const rpcUrl = process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
  const contractAddress = process.env.NEXT_PUBLIC_KITEBOND_CONTRACT;
  const tokenAddress = process.env.NEXT_PUBLIC_PAYMENT_TOKEN || "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!contractAddress) throw new Error("NEXT_PUBLIC_KITEBOND_CONTRACT not set");
  if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(deployerKey, provider);
  const creator = ethers.Wallet.createRandom().connect(provider);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI_MINIMAL, deployer);

  const packageName = "colors";
  const version = "1.4.0";
  const rewardAmount = "0.05";
  const stakeRequired = "0.05";
  const rewardWei = ethers.parseUnits(rewardAmount, 18);
  const creatorUsdt = ethers.parseUnits("0.08", 18);
  const creatorGas = ethers.parseEther("0.02");

  console.log("KiteBond Test Agent - create-test-hunt.ts");
  console.log("Creator address:", creator.address);
  console.log("Package:", `${packageName}@${version}`);

  const usdtBalance = (await token.balanceOf(deployer.address)) as bigint;
  if (usdtBalance < creatorUsdt) {
    throw new Error(`Insufficient deployer USDT. Need ${ethers.formatUnits(creatorUsdt, 18)}, have ${ethers.formatUnits(usdtBalance, 18)}`);
  }

  const kiteBalance = await provider.getBalance(deployer.address);
  if (kiteBalance < creatorGas + ethers.parseEther("0.01")) {
    throw new Error(`Insufficient deployer KITE. Need enough gas plus ${ethers.formatEther(creatorGas)} KITE creator funding.`);
  }

  console.log("Funding creator KITE...");
  const fundTx = await deployer.sendTransaction({ to: creator.address, value: creatorGas });
  await fundTx.wait();
  console.log("KITE funded. Tx:", fundTx.hash);

  console.log("Funding creator USDT...");
  const usdtTx = await token.transfer(creator.address, creatorUsdt);
  await usdtTx.wait();
  console.log("USDT funded. Tx:", usdtTx.hash);

  const creatorToken = new ethers.Contract(tokenAddress, ERC20_ABI_MINIMAL, creator);
  const registry = new ethers.Contract(contractAddress, HUNT_REGISTRY_ABI_MINIMAL, creator);

  console.log("Approving hunt reward...");
  const approveTx = await creatorToken.approve(contractAddress, rewardWei);
  await approveTx.wait();
  console.log("Reward approved. Tx:", approveTx.hash);

  const deadlineSeconds = 86_400;
  const deadline = new Date(Date.now() + deadlineSeconds * 1000);
  const terms = {
    packageName,
    version,
    rewardAmount,
    stakeRequired,
    deadline: deadline.toISOString(),
    investigationFocus: "Read-only npm supply-chain security investigation",
    safety: "registry metadata only; no package code execution"
  };

  console.log("Creating hunt...");
  const tx = await registry.createHunt(
    ethers.keccak256(ethers.toUtf8Bytes(packageName)),
    ethers.keccak256(ethers.toUtf8Bytes(version)),
    ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(terms))),
    0,
    rewardWei,
    ethers.parseUnits(stakeRequired, 18),
    BigInt(deadlineSeconds)
  );
  const receipt = await tx.wait();
  const iface = new ethers.Interface(HUNT_REGISTRY_ABI_MINIMAL);
  const event = receipt.logs
    .map((log: ethers.Log) => {
      try {
        return iface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed: ethers.LogDescription | null) => parsed?.name === "HuntCreated");
  const chainHuntId = Number(event?.args?.huntId);
  if (!chainHuntId) throw new Error("HuntCreated event not found");
  console.log("Hunt created. Chain Hunt ID:", chainHuntId);
  console.log("Create tx:", receipt.hash);

  const apiRes = await fetch(`${appUrl}/api/hunts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chainHuntId,
      creatorAddress: creator.address,
      packageName,
      version,
      rewardAmount,
      stakeRequired,
      deadline: deadline.toISOString(),
      termsHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(terms))),
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ packageName, version }))),
      createdTx: receipt.hash
    })
  });

  if (!apiRes.ok) throw new Error(`API hunt record failed: ${await apiRes.text()}`);
  const { data } = (await apiRes.json()) as { data: { id: string } };
  console.log("HUNT_ID=" + data.id);
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
