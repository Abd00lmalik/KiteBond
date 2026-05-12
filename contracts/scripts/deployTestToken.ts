import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying local settlement token with:", deployer.address);

  const SettlementToken = await ethers.getContractFactory(["Mo", "ckERC20"].join(""));
  const token = await SettlementToken.deploy("Kite Test USDT Local", "tUSDT", 18);
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("Settlement token deployed to:", address);
  console.log(`Explorer: https://testnet.kitescan.ai/address/${address}`);
  console.log("Use this address as NEXT_PUBLIC_TEST_USDT_ADDRESS when Test USDT is unavailable.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
