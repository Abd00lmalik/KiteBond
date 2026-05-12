import { NextRequest, NextResponse } from "next/server";
import { fetchNpmMeta } from "@/lib/npm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim();
  const version = req.nextUrl.searchParams.get("version")?.trim() || "latest";

  if (!name) {
    return NextResponse.json({ error: "Package name required", code: "PACKAGE_NAME_REQUIRED" }, { status: 400 });
  }

  try {
    const meta = await fetchNpmMeta(name, version);
    return NextResponse.json({ data: meta });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Registry error", code: "REGISTRY_ERROR" },
      { status: 400 }
    );
  }
}
