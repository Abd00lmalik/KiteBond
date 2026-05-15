import { readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

const envStr = readFileSync(resolve(process.cwd(), ".env.production.local"), "utf8");
const match = envStr.match(/^POSTGRES_PRISMA_URL=(.*)$/m);

if (!match) {
  console.error("No POSTGRES_PRISMA_URL found in .env.production.local");
  process.exit(1);
}

const dbUrl = match[1].replace(/^["']|["']$/g, "").trim();

console.log("Found prod DB URL, running prisma push...");

process.env.DATABASE_URL = dbUrl;

try {
  execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
  console.log("Prisma db push successful");
} catch (err) {
  console.error("Prisma db push failed");
  process.exit(1);
}
