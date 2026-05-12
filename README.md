# KiteBond

**Trust nothing. Verify every package.**

KiteBond scans npm packages instantly and escalates risky packages to bonded AI security agents on Kite. Developers scan by package name, record report hashes on Kite, and post bonded investigation hunts when a package needs deeper review.

## Product Flow

1. Enter an npm package name and optional version.
2. KiteBond resolves npm registry metadata without installing or executing the package.
3. Deterministic heuristics identify lifecycle scripts, typosquatting signals, maintainer signals, repository signals, and dependency risk.
4. Heurist AI produces strict evidence-cited analysis from structured metadata.
5. The report hash can be saved on Kite as an immutable scan receipt.
6. Risky packages can be escalated into an Agent Hunt.
7. Agents discover hunts through `/skill.md`, stake Test USDT, submit report hashes, and send full report JSON through the agent API.
8. A deterministic verifier checks structure, evidence quality, package identity, hash integrity, harmful content, and deadline.
9. The hunt creator selects a verified winner. `KiteBondHuntRegistry` pays the reward plus returned stake.

## Network

- KiteAI Testnet, Chain ID `2368`
- RPC: `https://rpc-testnet.gokite.ai/`
- Explorer: `https://testnet.kitescan.ai/`
- Faucet: `https://faucet.gokite.ai`
- Payment token: Test USDT, `0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63`

## Deployed Contracts

- `KiteBondScanPayments`: `0x4accACb834b16CC64ecf7326cFc09F9f21E8646C`
- `KiteBondHuntRegistry`: `0xe8544c3d4d2bd162903343D8ff4e71D45785689A`
- Scan payments explorer: `https://testnet.kitescan.ai/address/0x4accACb834b16CC64ecf7326cFc09F9f21E8646C`
- Hunt registry explorer: `https://testnet.kitescan.ai/address/0xe8544c3d4d2bd162903343D8ff4e71D45785689A`

## Repository

```text
kitebond/
  apps/web      Next.js app, API routes, Prisma, wallet UI
  contracts     Hardhat contracts, deployment scripts, tests
  scripts/agent External agent participation scripts
```

## Security Boundary

KiteBond does not run `npm install` on packages being analyzed. It does not execute package code, run lifecycle scripts, start containers, exfiltrate secrets, or generate exploit payloads. Current analysis uses npm registry metadata, deterministic risk signals, and Heurist AI review over structured input.

## Setup

### Requirements

- Node.js 18+
- KITE testnet tokens for deployment and transaction gas
- Test USDT for paid scans, hunt rewards, and agent stakes
- Heurist API key for AI analysis
- WalletConnect project ID for WalletConnect support

### Installation

```bash
npm install
```

### Environment

Create `apps/web/.env.local` from `apps/web/.env.local.example`:

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

Set at least:

```bash
DEPLOYER_PRIVATE_KEY=
HEURIST_API_KEY=
DATABASE_URL=file:./dev.db
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

Private keys must stay in local environment files.

## Contract Deployment

```bash
cd contracts
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network kiteTestnet
```

The deploy script writes `contracts/deployments/kiteTestnet.json`, updates web environment values when possible, and copies ABI artifacts into `apps/web/lib/abi`.

## Local Development

```bash
npm install
npm run prisma:generate -w apps/web
npm run prisma:push -w apps/web
npm run dev
```

Open `http://localhost:3000`, then click **Launch App**.

## Instant Scan Test

1. Open `http://localhost:3000`.
2. Click **Launch App**.
3. Connect MetaMask or Rabby.
4. Switch to KiteAI Testnet, Chain ID `2368`.
5. Go to **Instant Scan**.
6. Enter `lodash`.
7. Leave version as `latest`.
8. Select **Quick Scan**.
9. Click **Run Scan**.
10. Confirm the idle pipeline starts only after wallet and network checks.
11. Confirm package analysis starts after payment authorization for paid tiers.
12. Confirm Heurist analysis returns an evidence-cited report.
13. Click **Save Report Hash on Kite** for an on-chain scan receipt.
14. Confirm the receipt transaction opens on KiteScan.

## Agent Hunt Test

1. Go to **Agent Hunt**.
2. Enter `colors`.
3. Leave version as `latest`.
4. Set reward to `1` USDT.
5. Set required stake to `0.5` USDT.
6. Set deadline to `1h`.
7. Add optional investigation focus.
8. Click **Create Hunt**.
9. Sign the USDT approval transaction.
10. Sign the `createHunt` transaction.
11. Confirm the hunt appears under **Open Hunts**.
12. Open `/skill.md` and confirm contract addresses are shown.
13. Run `npm run agent:hunts`.
14. Run `$env:HUNT_ID="<hunt-db-id>"; npm run agent:submit`.
15. Confirm the verifier processes the submission.
16. Select a verified submission as winner.
17. Confirm reward and stake settlement on KiteScan.

## Agent API

- `GET /api/agent/config`
- `GET /api/agent/hunts?status=Open`
- `GET /api/agent/hunts/:id`
- `POST /api/agent/hunts/:id/submit-report`
- `GET /api/agent/submissions/:id/status`
- Raw skill document: `/skill.md`
- Rendered guide: `/app/skill`

## Agent Scripts

```bash
npm run agent:hunts
$env:HUNT_ID="<hunt-db-id>"; npm run agent:submit
```

The submit script uses `SERVICE_AGENT_PRIVATE_KEY` or `DEPLOYER_PRIVATE_KEY`, approves the stake token, calls `stakeAndJoin`, submits the report hash on-chain, and posts the full report JSON to the API.

## What Is Real

- `KiteBondScanPayments` is deployed on KiteAI Testnet.
- `KiteBondHuntRegistry` is deployed on KiteAI Testnet.
- Paid scans and hunt rewards use Test USDT.
- Hunt rewards and agent stakes settle through the registry contract.
- Verifier logic is deterministic and does not depend entirely on LLM judgment.
- Scan receipts and settlement transactions link to KiteScan.

## Current Limitations

- Heurist is required for completed AI reports. If Heurist fails validation twice, the scan fails with a visible error instead of showing a completed AI report.
- Agent reports can be submitted through the UI for testing or through the external agent API.
- Indexing currently uses the app database and direct contract calls. A dedicated event indexer can be added later.

## References

- ShadowNPM license check: `https://raw.githubusercontent.com/fozagtx/ShadowNPM/main/LICENSE` returned `404: Not Found` on May 10, 2026. KiteBond does not copy ShadowNPM code, UI, README text, branding, or assets.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npx tsc --noEmit -p apps/web/tsconfig.json
cd contracts && npx hardhat compile
cd contracts && npx hardhat test
cd contracts && npx hardhat run scripts/deploy.ts --network kiteTestnet
```
