import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {
    databaseUrl: process.env.DATABASE_URL ? "set" : "MISSING - set in Vercel env vars",
    heuristKey: process.env.HEURIST_API_KEY ? "set" : "MISSING - set in Vercel env vars"
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "connected";
  } catch (err) {
    checks.database = `ERROR: ${err instanceof Error ? err.message.slice(0, 100) : "unknown"}`;
  }

  try {
    await prisma.userUsage.count();
    checks.userUsage = "table OK";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.userUsage = message.includes("does not exist") ? "TABLE MISSING - run prisma db push" : `ERROR: ${message.slice(0, 80)}`;
  }

  try {
    await prisma.hunt.count();
    checks.hunt = "table OK";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.hunt = message.includes("does not exist") ? "TABLE MISSING - run prisma db push" : `ERROR: ${message.slice(0, 80)}`;
  }

  try {
    await prisma.instantScan.count();
    checks.instantScan = "table OK";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.instantScan = message.includes("does not exist") ? "TABLE MISSING - run prisma db push" : `ERROR: ${message.slice(0, 80)}`;
  }

  try {
    await prisma.submission.count();
    checks.submission = "table OK";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.submission = message.includes("does not exist") ? "TABLE MISSING - run prisma db push" : `ERROR: ${message.slice(0, 80)}`;
  }

  const allOk = Object.values(checks).every((value) => value === "set" || value === "connected" || value === "table OK");

  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
