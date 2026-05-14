import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    checks.database = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    await prisma.userUsage.count();
    checks.userUsage = "table exists";
  } catch (err) {
    checks.userUsage = `missing or error: ${err instanceof Error ? err.message.slice(0, 80) : "?"}`;
  }

  try {
    await prisma.hunt.count();
    checks.hunt = "table exists";
  } catch (err) {
    checks.hunt = `missing or error: ${err instanceof Error ? err.message.slice(0, 80) : "?"}`;
  }

  try {
    await prisma.instantScan.count();
    checks.instantScan = "table exists";
  } catch (err) {
    checks.instantScan = `missing or error: ${err instanceof Error ? err.message.slice(0, 80) : "?"}`;
  }

  try {
    await prisma.submission.count();
    checks.submission = "table exists";
  } catch (err) {
    checks.submission = `missing or error: ${err instanceof Error ? err.message.slice(0, 80) : "?"}`;
  }

  checks.heuristKey = process.env.HEURIST_API_KEY ? "set" : "MISSING";
  checks.databaseUrl = process.env.DATABASE_URL ? "set" : "MISSING";

  const allOk = Object.values(checks).every((value) => value === "ok" || value === "table exists" || value === "set");

  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
