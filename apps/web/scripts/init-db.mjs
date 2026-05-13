import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/kitebond";

if (databaseUrl.startsWith("file:")) {
  console.error("Prisma is configured for PostgreSQL. Set DATABASE_URL to a postgresql:// connection string.");
  process.exit(1);
}

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
