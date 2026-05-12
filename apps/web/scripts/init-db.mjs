import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";

const generate = spawnSync("npx", ["prisma", "generate"], {
  cwd: process.cwd(),
  shell: true,
  stdio: "inherit"
});

if ((generate.status ?? 1) !== 0) {
  process.exit(generate.status ?? 1);
}

const push = spawnSync("npx", ["prisma", "db", "push", "--accept-data-loss"], {
  cwd: process.cwd(),
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  }
});

if ((push.status ?? 1) !== 0) {
  process.exit(push.status ?? 1);
}

const rawPath = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
const displayPath = databaseUrl.startsWith("file:")
  ? resolve(process.cwd(), "prisma", rawPath)
  : databaseUrl;

console.log(`Database ready: ${displayPath}`);
