/**
 * Stakes and submits a report to a hunt.
 * Usage: $env:HUNT_ID="<db-id>"; npm run agent:submit
 *
 * Uses SERVICE_AGENT_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY as an agent wallet.
 * Never prints private keys. Uses KiteAI Testnet only.
 */

import * as dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: "apps/web/.env.local", override: false });

const HUNT_REGISTRY_ABI_MINIMAL = [
  "function stakeAndJoin(uint256 huntId) external",
  "function submitReport(uint256 huntId, bytes32 reportHash) external",
  "function hasStaked(uint256 huntId, address agent) external view returns (bool)"
];

const ERC20_ABI_MINIMAL = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)"
];

async function main() {
  const huntDbId = process.env.HUNT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
  const rpcUrl = process.env.NEXT_PUBLIC_KITE_RPC_URL || "https://rpc-testnet.gokite.ai/";
  const contractAddress = process.env.NEXT_PUBLIC_KITEBOND_CONTRACT;
  const tokenAddress = process.env.NEXT_PUBLIC_PAYMENT_TOKEN || "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";
  const agentKey = process.env.SERVICE_AGENT_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

  if (!huntDbId) throw new Error("Set HUNT_ID=<db-id> before running this script");
  if (!contractAddress) throw new Error("NEXT_PUBLIC_KITEBOND_CONTRACT not set");
  if (!agentKey) throw new Error("Set SERVICE_AGENT_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");

  console.log("KiteBond Test Agent - stake-and-submit.ts");
  console.log("Hunt DB ID:", huntDbId);
  console.log("App:", appUrl);
  console.log("Contract:", contractAddress);
  console.log("-".repeat(50));

  const huntRes = await fetch(`${appUrl}/api/agent/hunts/${huntDbId}`);
  if (!huntRes.ok) throw new Error(`Hunt not found: ${await huntRes.text()}`);
  const { data: hunt } = (await huntRes.json()) as { data: Record<string, unknown> };

  console.log(`Package: ${hunt.packageName}@${hunt.version}`);
  console.log(`Chain Hunt ID: ${hunt.chainHuntId}`);
  const stakeAmount = BigInt(hunt.stakeRequired as string);
  console.log(`Stake required: ${ethers.formatUnits(stakeAmount, 18)} USDT`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(agentKey, provider);
  const agentAddress = wallet.address;
  console.log(`Agent address: ${agentAddress}`);

  const kiteBalance = await provider.getBalance(agentAddress);
  console.log(`KITE balance: ${ethers.formatEther(kiteBalance)}`);
  if (kiteBalance < ethers.parseEther("0.001")) {
    throw new Error("Insufficient KITE for gas. Fund at https://faucet.gokite.ai");
  }

  const token = new ethers.Contract(tokenAddress, ERC20_ABI_MINIMAL, wallet);
  const registry = new ethers.Contract(contractAddress, HUNT_REGISTRY_ABI_MINIMAL, wallet);

  const usdtBalance = (await token.balanceOf(agentAddress)) as bigint;
  console.log(`USDT balance: ${ethers.formatUnits(usdtBalance, 18)}`);
  if (usdtBalance < stakeAmount) {
    throw new Error(`Insufficient USDT. Need ${ethers.formatUnits(stakeAmount, 18)}, have ${ethers.formatUnits(usdtBalance, 18)}`);
  }

  const chainHuntId = BigInt(hunt.chainHuntId as number);
  let stakeTxHash: string | undefined;
  const alreadyStaked = (await registry.hasStaked(chainHuntId, agentAddress)) as boolean;
  if (!alreadyStaked) {
    console.log("\nStep 1: Approving USDT...");
    const approveTx = await token.approve(contractAddress, stakeAmount);
    await approveTx.wait();
    console.log("Approved. Tx:", approveTx.hash);

    console.log("\nStep 2: Staking and joining hunt...");
    const stakeTx = await registry.stakeAndJoin(chainHuntId);
    const stakeReceipt = await stakeTx.wait();
    stakeTxHash = stakeReceipt.hash;
    console.log("Staked. Tx:", stakeTxHash);
  } else {
    console.log("\nAlready staked for this hunt. Continuing...");
  }

  console.log("\nStep 3: Analyzing package...");
  const scanRes = await fetch(`${appUrl}/api/scan/instant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      packageName: hunt.packageName,
      version: hunt.version,
      scanDepth: "standard",
      walletAddress: agentAddress,
      isAgentSubmission: true
    })
  });

  if (!scanRes.ok) throw new Error(`Scan failed: ${await scanRes.text()}`);
  const { data: scanData } = (await scanRes.json()) as { data: { report: Record<string, unknown> } };

  const report: Record<string, unknown> = {
    ...scanData.report,
    huntId: huntDbId,
    agentAddress
  };
  const reportHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(report)));
  console.log(`Report hash: ${reportHash}`);
  console.log(`Risk level: ${String(report.riskLevel)} (score: ${String(report.riskScore)})`);

  console.log("\nStep 4: Submitting report hash on-chain...");
  const submitTx = await registry.submitReport(chainHuntId, reportHash);
  const submitReceipt = await submitTx.wait();
  console.log("Submitted on-chain. Tx:", submitReceipt.hash);

  console.log("\nStep 5: Submitting full report via API...");
  const apiRes = await fetch(`${appUrl}/api/agent/hunts/${huntDbId}/submit-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentAddress,
      stakeTxHash,
      submitTxHash: submitReceipt.hash,
      reportHash,
      reportJson: report
    })
  });

  if (!apiRes.ok) throw new Error(`API submission failed: ${await apiRes.text()}`);

  const { data: submission } = (await apiRes.json()) as { data: { id: string } };
  console.log("\nSubmission complete");
  console.log(`Submission ID: ${submission.id}`);
  console.log(`View hunt: ${appUrl}/app/hunts/${huntDbId}`);
  console.log(`Check status: ${appUrl}/api/agent/submissions/${submission.id}/status`);
}

main().catch((err: unknown) => {
  console.error("\nError:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
