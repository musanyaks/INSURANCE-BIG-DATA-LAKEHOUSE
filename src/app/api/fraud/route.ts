import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { alertId?: string; status?: string; assignedTo?: string };
  if (!body.alertId) return NextResponse.json({ error: "alertId required" }, { status: 400 });
  const set: Record<string, unknown> = {};
  if (body.status) set.status = body.status;
  if (body.assignedTo !== undefined) set.assignedTo = body.assignedTo;
  await db.update(S.factFraudEvents).set(set).where(eq(S.factFraudEvents.alertId, body.alertId));
  const [row] = await db.select().from(S.factFraudEvents).where(eq(S.factFraudEvents.alertId, body.alertId));
  return NextResponse.json({ ok: true, alert: row });
}

export async function GET() {
  const rows = await db
    .select({ status: S.factFraudEvents.status, n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${S.factFraudEvents.amountAtRisk}),0)::float` })
    .from(S.factFraudEvents)
    .groupBy(S.factFraudEvents.status);
  return NextResponse.json({ queue: rows });
}
