import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compatibility endpoint: serves public/skill.md as text/markdown
export async function GET() {
  try {
    const filePath = join(process.cwd(), "public", "skill.md");
    const content = await readFile(filePath, "utf-8");
    return new NextResponse(content, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8" }
    });
  } catch {
    return NextResponse.json({ error: "skill.md not found" }, { status: 404 });
  }
}
