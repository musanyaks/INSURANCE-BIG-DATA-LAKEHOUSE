import { NextResponse } from "next/server";
import { runClaimPipeline, type IntakeInput } from "@/lib/stream";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as IntakeInput;
  try {
    const result = await runClaimPipeline(input);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "claim intake failed" }, { status: 500 });
  }
}
