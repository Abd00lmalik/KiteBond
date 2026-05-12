import { expect } from "chai";
import { ethers, network } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { ContractTransactionResponse } from "ethers";

describe("KiteBondScanPayments", function () {
  async function fixture() {
    const [owner, user, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Test USDT", "USDT", 18);
    await token.waitForDeployment();

    await token.mint(user.address, ethers.parseEther("100"));

    const ScanPayments = await ethers.getContractFactory("KiteBondScanPayments");
    const scanPayments = await ScanPayments.deploy(await token.getAddress(), treasury.address);
    await scanPayments.waitForDeployment();

    return { owner, user, treasury, token, scanPayments };
  }

  it("authorizes the first Quick scan for free", async function () {
    const { user, treasury, token, scanPayments } = await fixture();
    const scanId = ethers.id("scan-1");

    await expect(
      scanPayments.connect(user).authorizeScan(ethers.id("lodash"), ethers.id("latest"), 0, scanId)
    )
      .to.emit(scanPayments, "InstantScanAuthorized")
      .withArgs(user.address, ethers.id("lodash"), ethers.id("latest"), 0, 0, scanId, anyValue);

    expect(await scanPayments.usedFreeScan(user.address)).to.equal(true);
    expect(await token.balanceOf(treasury.address)).to.equal(0);
  });

  it("charges later Quick scans when a quick price is configured", async function () {
    const { owner, user, treasury, token, scanPayments } = await fixture();
    await scanPayments.connect(owner).setPrices(ethers.parseEther("0.2"), ethers.parseEther("1"), ethers.parseEther("3"));
    await token.connect(user).approve(await scanPayments.getAddress(), ethers.parseEther("1"));

    await scanPayments.connect(user).authorizeScan(ethers.id("lodash"), ethers.id("latest"), 0, ethers.id("scan-1"));
    await scanPayments.connect(user).authorizeScan(ethers.id("axios"), ethers.id("latest"), 0, ethers.id("scan-2"));

    expect(await token.balanceOf(treasury.address)).to.equal(ethers.parseEther("0.2"));
  });

  it("charges Standard and Deep scans", async function () {
    const { user, treasury, token, scanPayments } = await fixture();
    await token.connect(user).approve(await scanPayments.getAddress(), ethers.parseEther("10"));

    await scanPayments.connect(user).authorizeScan(ethers.id("react"), ethers.id("latest"), 1, ethers.id("standard"));
    await scanPayments.connect(user).authorizeScan(ethers.id("express"), ethers.id("latest"), 2, ethers.id("deep"));

    expect(await token.balanceOf(treasury.address)).to.equal(ethers.parseEther("4"));
  });

  it("anchors scan proof hashes", async function () {
    const { user, scanPayments } = await fixture();
    const scanId = ethers.id("scan-proof");
    const reportHash = ethers.id("report");

    await scanPayments.connect(user).authorizeScan(ethers.id("lodash"), ethers.id("latest"), 0, scanId);
    await expect(scanPayments.connect(user).anchorProof(scanId, reportHash))
      .to.emit(scanPayments, "InstantScanProofAnchored")
      .withArgs(user.address, scanId, reportHash, anyValue);
  });

  it("limits pricing and withdrawal admin functions to the owner", async function () {
    const { owner, user, scanPayments } = await fixture();
    await expect(scanPayments.connect(user).setPrices(0, 1, 2)).to.be.revertedWithCustomError(scanPayments, "OwnableUnauthorizedAccount");
    await expect(scanPayments.connect(user).withdraw(1)).to.be.revertedWithCustomError(scanPayments, "OwnableUnauthorizedAccount");
    await expect(scanPayments.connect(owner).setPrices(0, 1, 2)).to.not.be.reverted;
  });
});

describe("KiteBondHuntRegistry", function () {
  async function fixture() {
    const [owner, creator, agent, agentTwo, treasury, verifier] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Test USDT", "USDT", 18);
    await token.waitForDeployment();

    for (const signer of [creator, agent, agentTwo]) {
      await token.mint(signer.address, ethers.parseEther("100"));
    }

    const HuntRegistry = await ethers.getContractFactory("KiteBondHuntRegistry");
    const registry = await HuntRegistry.deploy(await token.getAddress(), treasury.address, verifier.address);
    await registry.waitForDeployment();

    return { owner, creator, agent, agentTwo, treasury, verifier, token, registry };
  }

  async function createHunt(fx: Awaited<ReturnType<typeof fixture>>) {
    const reward = ethers.parseEther("10");
    const stake = ethers.parseEther("5");
    await fx.token.connect(fx.creator).approve(await fx.registry.getAddress(), reward);
    const tx = (await fx.registry
      .connect(fx.creator)
      .createHunt(ethers.id("colors"), ethers.id("latest"), ethers.id("terms"), 0, reward, stake, 7200)) as ContractTransactionResponse;
    const receipt = await tx.wait();
    expect(receipt).to.not.equal(null);
    return { huntId: 1n, reward, stake };
  }

  async function stakeAndSubmit(fx: Awaited<ReturnType<typeof fixture>>, signerIndex: "agent" | "agentTwo" = "agent") {
    const signer = fx[signerIndex];
    await fx.token.connect(signer).approve(await fx.registry.getAddress(), ethers.parseEther("5"));
    await fx.registry.connect(signer).stakeAndJoin(1);
    const reportHash = ethers.id(`report-${signerIndex}`);
    await fx.registry.connect(signer).submitReport(1, reportHash);
    return { signer, reportHash };
  }

  it("creates hunts and locks rewards", async function () {
    const fx = await fixture();
    const { reward, stake } = await createHunt(fx);

    const hunt = await fx.registry.getHunt(1);
    expect(hunt.creator).to.equal(fx.creator.address);
    expect(hunt.rewardAmount).to.equal(reward);
    expect(hunt.stakeRequired).to.equal(stake);
    expect(await fx.token.balanceOf(await fx.registry.getAddress())).to.equal(reward);
  });

  it("allows agents to stake and join, but blocks creator self-join", async function () {
    const fx = await fixture();
    await createHunt(fx);

    await fx.token.connect(fx.agent).approve(await fx.registry.getAddress(), ethers.parseEther("5"));
    await expect(fx.registry.connect(fx.agent).stakeAndJoin(1))
      .to.emit(fx.registry, "AgentStaked")
      .withArgs(1, fx.agent.address, ethers.parseEther("5"), anyValue);

    await fx.token.connect(fx.creator).approve(await fx.registry.getAddress(), ethers.parseEther("5"));
    await expect(fx.registry.connect(fx.creator).stakeAndJoin(1)).to.be.revertedWith("Creator cannot be agent");
  });

  it("requires stake before report submission", async function () {
    const fx = await fixture();
    await createHunt(fx);
    await expect(fx.registry.connect(fx.agent).submitReport(1, ethers.id("report"))).to.be.revertedWith("Must stake first");
  });

  it("submits and verifies valid submissions", async function () {
    const fx = await fixture();
    await createHunt(fx);
    await stakeAndSubmit(fx);

    await expect(fx.registry.connect(fx.verifier).verifySubmission(1, 0, true, ethers.id("verification")))
      .to.emit(fx.registry, "SubmissionVerified")
      .withArgs(1, 0, fx.agent.address, true, ethers.id("verification"), anyValue);
  });

  it("slashes invalid submissions", async function () {
    const fx = await fixture();
    await createHunt(fx);
    await stakeAndSubmit(fx);

    await expect(fx.registry.connect(fx.verifier).verifySubmission(1, 0, false, ethers.id("bad")))
      .to.emit(fx.registry, "StakeSlashed")
      .withArgs(1, fx.agent.address, ethers.parseEther("5"), fx.treasury.address, anyValue);
    expect(await fx.token.balanceOf(fx.treasury.address)).to.equal(ethers.parseEther("5"));
  });

  it("selects a winner and pays reward plus stake", async function () {
    const fx = await fixture();
    await createHunt(fx);
    await stakeAndSubmit(fx);
    const before = await fx.token.balanceOf(fx.agent.address);

    await fx.registry.connect(fx.verifier).verifySubmission(1, 0, true, ethers.id("verification"));
    await expect(fx.registry.connect(fx.creator).selectWinner(1, 0)).to.emit(fx.registry, "HuntSettled").withArgs(1, true, anyValue);

    expect(await fx.token.balanceOf(fx.agent.address)).to.equal(before + ethers.parseEther("15"));
  });

  it("lets valid non-winners reclaim stake", async function () {
    const fx = await fixture();
    await createHunt(fx);
    await stakeAndSubmit(fx, "agent");
    await stakeAndSubmit(fx, "agentTwo");

    await fx.registry.connect(fx.verifier).verifySubmission(1, 0, true, ethers.id("v1"));
    await fx.registry.connect(fx.verifier).verifySubmission(1, 1, true, ethers.id("v2"));
    await fx.registry.connect(fx.creator).selectWinner(1, 0);

    await expect(fx.registry.connect(fx.agentTwo).reclaimStake(1))
      .to.emit(fx.registry, "StakeReturned")
      .withArgs(1, fx.agentTwo.address, ethers.parseEther("5"), anyValue);
  });

  it("does not let slashed submissions reclaim stake", async function () {
    const fx = await fixture();
    await createHunt(fx);
    await stakeAndSubmit(fx);
    await fx.registry.connect(fx.verifier).verifySubmission(1, 0, false, ethers.id("bad"));

    await network.provider.send("evm_increaseTime", [7201]);
    await network.provider.send("evm_mine");
    await fx.registry.expireHunt(1);

    await expect(fx.registry.connect(fx.agent).reclaimStake(1)).to.be.revertedWith("No stake to reclaim");
  });

  it("cancels open hunts before submissions", async function () {
    const fx = await fixture();
    await createHunt(fx);
    await expect(fx.registry.connect(fx.creator).cancelHunt(1)).to.emit(fx.registry, "HuntCancelled");
  });

  it("expires hunts and refunds creators when no valid submissions exist", async function () {
    const fx = await fixture();
    await createHunt(fx);

    await network.provider.send("evm_increaseTime", [7201]);
    await network.provider.send("evm_mine");

    await expect(fx.registry.expireHunt(1)).to.emit(fx.registry, "HuntExpired");
  });

  it("blocks reentrant stake attempts", async function () {
    const [creator, agent, treasury, verifier] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockReentrantToken");
    const token = await Token.deploy();
    await token.waitForDeployment();

    const Registry = await ethers.getContractFactory("KiteBondHuntRegistry");
    const registry = await Registry.deploy(await token.getAddress(), treasury.address, verifier.address);
    await registry.waitForDeployment();

    const reward = ethers.parseEther("10");
    const stake = ethers.parseEther("5");
    await token.mint(creator.address, reward);
    await token.mint(agent.address, stake);
    await token.connect(creator).approve(await registry.getAddress(), reward);
    await registry.connect(creator).createHunt(ethers.id("colors"), ethers.id("latest"), ethers.id("terms"), 0, reward, stake, 7200);

    await token.connect(agent).approve(await registry.getAddress(), stake);
    await token.setStakeAttack(await registry.getAddress(), 1);
    await registry.connect(agent).stakeAndJoin(1);

    expect(await token.attempted()).to.equal(true);
    expect(await registry.agentStake(1, agent.address)).to.equal(stake);
    expect(await token.balanceOf(await registry.getAddress())).to.equal(reward + stake);
  });

  it("blocks reentrant winner selection attempts", async function () {
    const [creator, agent, treasury, verifier] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockReentrantToken");
    const token = await Token.deploy();
    await token.waitForDeployment();

    const Registry = await ethers.getContractFactory("KiteBondHuntRegistry");
    const registry = await Registry.deploy(await token.getAddress(), treasury.address, verifier.address);
    await registry.waitForDeployment();

    const reward = ethers.parseEther("10");
    const stake = ethers.parseEther("5");
    await token.mint(creator.address, reward);
    await token.mint(agent.address, stake);
    await token.connect(creator).approve(await registry.getAddress(), reward);
    await registry.connect(creator).createHunt(ethers.id("colors"), ethers.id("latest"), ethers.id("terms"), 0, reward, stake, 7200);
    await token.connect(agent).approve(await registry.getAddress(), stake);
    await registry.connect(agent).stakeAndJoin(1);
    await registry.connect(agent).submitReport(1, ethers.id("report"));
    await registry.connect(verifier).verifySubmission(1, 0, true, ethers.id("verification"));

    await token.setSelectWinnerAttack(await registry.getAddress(), 1, 0);
    await registry.connect(creator).selectWinner(1, 0);

    expect(await token.attempted()).to.equal(true);
    const hunt = await registry.getHunt(1);
    expect(hunt.winner).to.equal(agent.address);
    expect(await token.balanceOf(agent.address)).to.equal(reward + stake);
  });
});
