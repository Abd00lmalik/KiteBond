import { NextRequest, NextResponse } from "next/server";
import { decodeHuntCreatedFromTx } from "@/lib/huntSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let txHash = "";
  try {
    const body = (await req.json()) as { txHash?: string };
    txHash = body.txHash?.trim() ?? "";
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!txHash) {
    return NextResponse.json({ success: false, error: "txHash is required." }, { status: 400 });
  }

  try {
    const decoded = await decodeHuntCreatedFromTx(txHash);
    return NextResponse.json({ success: true, decoded });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        txHash,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
