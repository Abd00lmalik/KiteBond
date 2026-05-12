import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function upsertEnv(env: string, key: string, value: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (env.includes(`${key}=`)) {
    return env.replace(new RegExp(`${escaped}=.*`), `${key}=${value}`);
  }
  return `${env.trimEnd()}\n${key}=${value}\n`;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("KITE balance:", ethers.formatEther(balance));
  if (balance === 0n) throw new Error("No KITE. Fund at https://faucet.gokite.ai");

  let paymentToken =
    process.env.NEXT_PUBLIC_PAYMENT_TOKEN ||
    process.env.NEXT_PUBLIC_TEST_USDT_ADDRESS ||
    process.env.PAYMENT_TOKEN_ADDRESS ||
    "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";

  try {
    const tokenCode = await deployer.provider.getCode(paymentToken);
    if (tokenCode === "0x") {
      console.log("Test USDT not found at configured address. Deploying MockUSDT...");
      const MockUSDT = await ethers.getContractFactory("MockUSDT");
      const token = await MockUSDT.deploy();
      await token.waitForDeployment();
      paymentToken = await token.getAddress();
      console.log("MockUSDT deployed:", paymentToken);
    } else {
      console.log("Test USDT confirmed at:", paymentToken);
    }
  } catch {
    console.log("Could not verify token. Using configured address:", paymentToken);
  }

  const treasury = process.env.PROTOCOL_TREASURY || deployer.address;
  const verifier = process.env.VERIFIER_AGENT_PRIVATE_KEY
    ? new ethers.Wallet(process.env.VERIFIER_AGENT_PRIVATE_KEY).address
    : deployer.address;

  console.log("Treasury:", treasury);
  console.log("Verifier:", verifier);

  const ScanPayments = await ethers.getContractFactory("KiteBondScanPayments");
  const scanPayments = await ScanPayments.deploy(paymentToken, treasury);
  await scanPayments.waitForDeployment();
  const scanPaymentsAddr = await scanPayments.getAddress();
  console.log("KiteBondScanPayments:", scanPaymentsAddr);

  const HuntRegistry = await ethers.getContractFactory("KiteBondHuntRegistry");
  const huntRegistry = await HuntRegistry.deploy(paymentToken, treasury, verifier);
  await huntRegistry.waitForDeployment();
  const huntRegistryAddr = await huntRegistry.getAddress();
  console.log("KiteBondHuntRegistry:", huntRegistryAddr);

  const deployment = {
    scanPayments: scanPaymentsAddr,
    huntRegistry: huntRegistryAddr,
    paymentToken,
    treasury,
    verifier,
    deployer: deployer.address,
    chainId: 2368,
    network: "kiteTestnet",
    deployedAt: new Date().toISOString(),
    explorerBase: "https://testnet.kitescan.ai"
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(path.join(deploymentsDir, "kiteTestnet.json"), JSON.stringify(deployment, null, 2));

  const webDeploymentPath = path.join(__dirname, "..", "..", "apps", "web", "lib", "deployment.json");
  fs.mkdirSync(path.dirname(webDeploymentPath), { recursive: true });
  fs.writeFileSync(webDeploymentPath, JSON.stringify(deployment, null, 2));

  const envPaths = [
    path.join(__dirname, "..", "..", "apps", "web", ".env.local"),
    path.join(__dirname, "..", "..", ".env.local")
  ];

  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    let env = fs.readFileSync(envPath, "utf8");
    env = upsertEnv(env, "NEXT_PUBLIC_KITEBOND_CONTRACT", huntRegistryAddr);
    env = upsertEnv(env, "NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT", scanPaymentsAddr);
    env = upsertEnv(env, "NEXT_PUBLIC_PAYMENT_TOKEN", paymentToken);
    env = upsertEnv(env, "NEXT_PUBLIC_TEST_USDT_ADDRESS", paymentToken);
    env = upsertEnv(env, "NEXT_PUBLIC_PROTOCOL_TREASURY", treasury);
    fs.writeFileSync(envPath, env);
    console.log("Updated", envPath);
  }

  console.log("\nDeployment complete");
  console.log("KiteBondScanPayments:", `https://testnet.kitescan.ai/address/${scanPaymentsAddr}`);
  console.log("KiteBondHuntRegistry:", `https://testnet.kitescan.ai/address/${huntRegistryAddr}`);
  console.log("Payment token:", paymentToken);
  console.log("\nIf .env.local was not auto-updated, add these manually:");
  console.log(`NEXT_PUBLIC_KITEBOND_CONTRACT=${huntRegistryAddr}`);
  console.log(`NEXT_PUBLIC_SCAN_PAYMENTS_CONTRACT=${scanPaymentsAddr}`);
  console.log(`NEXT_PUBLIC_PAYMENT_TOKEN=${paymentToken}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Deployment failed:", message);
  if (message.includes("insufficient funds")) console.error("Fund deployer at https://faucet.gokite.ai");
  if (message.includes("network")) console.error("Check NEXT_PUBLIC_KITE_RPC_URL");
  if (message.includes("private key")) console.error("Check DEPLOYER_PRIVATE_KEY format");
  process.exit(1);
});
