import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const [topics, events, alerts, runs] = await Promise.all([
    db.select().from(S.streamMetric).orderBy(desc(S.streamMetric.ts)).limit(80),
    db
      .select({ eventId: S.bronzeEvent.eventId, topic: S.bronzeEvent.topic, source: S.bronzeEvent.sourceSystem, ts: S.bronzeEvent.eventTime, bytes: S.bronzeEvent.payloadBytes, mode: S.bronzeEvent.ingestMode, claimId: sql<string>`${S.bronzeEvent.payload}->>'claim_id'`, amount: sql<string>`${S.bronzeEvent.payload}->>'claim_amount'` })
      .from(S.bronzeEvent)
      .orderBy(desc(S.bronzeEvent.eventTime))
      .limit(14),
    db
      .select({ alertId: S.factFraudEvents.alertId, claimId: S.factFraudEvents.claimId, score: S.factFraudEvents.fraudScore, level: S.factFraudEvents.riskLevel, amount: S.factFraudEvents.amountAtRisk, status: S.factFraudEvents.status, detectedAt: S.factFraudEvents.detectedAt, mode: S.factFraudEvents.detectionMode })
      .from(S.factFraudEvents)
      .orderBy(desc(S.factFraudEvents.detectedAt))
      .limit(8),
    db.select({ dag: S.pipelineRun.dagId, status: S.pipelineRun.status, ms: S.pipelineRun.durationMs, at: S.pipelineRun.startedAt }).from(S.pipelineRun).orderBy(desc(S.pipelineRun.startedAt)).limit(6),
  ]);
  const byTopic = new Map<string, typeof topics>();
  for (const t of topics) {
    const arr = byTopic.get(t.topic) ?? [];
    arr.push(t);
    byTopic.set(t.topic, arr);
  }
  return NextResponse.json({
    throughput: [...byTopic.entries()].map(([topic, rows]) => ({
      topic,
      points: rows
        .slice(0, 24)
        .reverse()
        .map((r) => ({ t: r.ts.toISOString().slice(11, 16), eps: r.eventsPerSec })),
      eps: rows[0]?.eventsPerSec ?? 0,
      lag: rows[0]?.lag ?? 0,
      p95: rows[0]?.p95LatencyMs ?? 0,
      offset: rows[0]?.offset ?? 0,
    })),
    events,
    alerts,
    runs,
    ts: new Date().toISOString(),
  });
}
