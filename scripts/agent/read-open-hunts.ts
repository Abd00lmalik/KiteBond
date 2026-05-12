/**
 * Lists open Agent Hunt tasks.
 * Usage: npx ts-node scripts/agent/read-open-hunts.ts
 * Or:    APP_URL=http://localhost:3000 npx ts-node scripts/agent/read-open-hunts.ts
 */

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: "apps/web/.env.local", override: false });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";

async function main() {
  console.log("KiteBond Agent - Open Hunt Discovery");
  console.log("App:", APP_URL);
  console.log("-".repeat(50));

  const res = await fetch(`${APP_URL}/api/agent/hunts?status=Open`);
  if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as { data?: unknown[] };
  const hunts = data.data ?? [];

  if (hunts.length === 0) {
    console.log("No open hunts found. Create one at /app/agent-hunt");
    return;
  }

  console.log(`Found ${hunts.length} open hunt(s):\n`);
  for (const hunt of hunts as Record<string, unknown>[]) {
    const reward = BigInt(hunt.rewardAmount as string);
    const stake = BigInt(hunt.stakeRequired as string);
    const formatUsdt = (value: bigint) => `${Number(value) / 1e18} USDT`;
    const deadline = new Date(hunt.deadline as string);
    const msLeft = deadline.getTime() - Date.now();
    const hoursLeft = (msLeft / 3_600_000).toFixed(1);

    console.log(`Hunt: ${hunt.id}`);
    console.log(`  Chain Hunt ID: ${hunt.chainHuntId}`);
    console.log(`  Package:  ${hunt.packageName}@${hunt.version}`);
    console.log(`  Reward:   ${formatUsdt(reward)}`);
    console.log(`  Stake:    ${formatUsdt(stake)}`);
    console.log(`  Deadline: ${deadline.toISOString()} (${hoursLeft}h remaining)`);
    console.log(`  Submissions: ${hunt.submissionCount ?? 0}`);
    console.log();
  }
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
