-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "UserUsage" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "address" TEXT,
    "freeScansUsed" INTEGER NOT NULL DEFAULT 0,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "totalScans" INTEGER NOT NULL DEFAULT 0,
    "huntCount" INTEGER NOT NULL DEFAULT 0,
    "lastScanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstantScan" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "address" TEXT,
    "packageName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "packageVersion" TEXT,
    "scanDepth" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "amountPaid" TEXT,
    "paymentTx" TEXT,
    "proofTx" TEXT,
    "proofTxHash" TEXT,
    "scanId" TEXT NOT NULL,
    "proofHash" TEXT,
    "reportHash" TEXT,
    "reportJson" JSONB,
    "proofAnchored" BOOLEAN NOT NULL DEFAULT false,
    "severity" TEXT NOT NULL DEFAULT 'unknown',
    "riskScore" INTEGER,
    "riskLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstantScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hunt" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL DEFAULT 2368,
    "chainHuntId" INTEGER,
    "onChainId" INTEGER,
    "creatorAddress" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "scanDepth" TEXT NOT NULL,
    "rewardAmount" TEXT NOT NULL,
    "stakeRequired" TEXT NOT NULL,
    "stakeAmount" TEXT,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "termsHash" TEXT,
    "metadataHash" TEXT,
    "createdTx" TEXT,
    "txHash" TEXT,
    "winnerAddress" TEXT,
    "settlementTx" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hunt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "huntId" TEXT NOT NULL,
    "agentAddress" TEXT NOT NULL,
    "stakeTx" TEXT,
    "reportHash" TEXT,
    "reportJson" JSONB,
    "proofHash" TEXT,
    "txHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "verifierResult" BOOLEAN,
    "verifierReport" JSONB,
    "verificationHash" TEXT,
    "verificationTx" TEXT,
    "settlementTx" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainEvent" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "address" TEXT NOT NULL,
    "totalSubmitted" INTEGER NOT NULL DEFAULT 0,
    "totalValid" INTEGER NOT NULL DEFAULT 0,
    "totalInvalid" INTEGER NOT NULL DEFAULT 0,
    "totalWon" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" TEXT NOT NULL DEFAULT '0',
    "totalSlashed" TEXT NOT NULL DEFAULT '0',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("address")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserUsage_walletAddress_key" ON "UserUsage"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "UserUsage_address_key" ON "UserUsage"("address");

-- CreateIndex
CREATE UNIQUE INDEX "InstantScan_scanId_key" ON "InstantScan"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "Hunt_chainHuntId_key" ON "Hunt"("chainHuntId");

-- CreateIndex
CREATE UNIQUE INDEX "Hunt_onChainId_key" ON "Hunt"("onChainId");

-- CreateIndex
CREATE UNIQUE INDEX "Hunt_txHash_key" ON "Hunt"("txHash");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "Hunt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
