import { NextResponse } from "next/server";
import { getProgress, startSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const p = getProgress();
  return NextResponse.json(p);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const { started, progress } = startSeed(body.force === true);
  return NextResponse.json({ started, progress }, { status: started ? 202 : 200 });
}
