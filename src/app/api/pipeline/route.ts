import { NextResponse } from "next/server";
import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";

export const dynamic = "force-dynamic";

const DAG_DEFAULTS: Record<string, { task: string; layer: string; engine: string; mode: string; topic: string }> = {
  insurelake_bronze_ingest: { task: "spark_streaming_landing", layer: "bronze", engine: "Spark Structured Streaming", mode: "micro-batch (30s)", topic: "insurance.claims" },
  insurelake_silver_claims: { task: "dbt_silver_claim", layer: "silver", engine: "dbt-core + Trino", mode: "incremental (watermark)", topic: "insurance.claims" },
  insurelake_gold_marts: { task: "dbt_build_gold", layer: "gold", engine: "dbt-core + Trino", mode: "incremental (merge)", topic: "insurance.claims" },
  insurelake_fraud_scoring: { task: "spark_score_claims", layer: "ml", engine: "Spark ML + MLflow", mode: "streaming + nightly batch", topic: "insurance.fraud_alerts" },
  insurelake_actuarial_reserving: { task: "r_chainladder_mack", layer: "actuarial", engine: "R (chainladder, actuar)", mode: "full refresh", topic: "insurance.claims" },
  insurelake_dq_great_expectations: { task: "ge_checkpoint", layer: "governance", engine: "Great Expectations", mode: "post-hook", topic: "insurance.claims" },
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { dagId?: string };
  const dagId = body.dagId && DAG_DEFAULTS[body.dagId] ? body.dagId : "insurelake_silver_claims";
  const cfg = DAG_DEFAULTS[dagId];
  const t0 = performance.now();

  const [last] = await db.select().from(S.pipelineRun).where(eq(S.pipelineRun.dagId, dagId)).orderBy(desc(S.pipelineRun.startedAt)).limit(1);
  const watermark = last?.startedAt ?? new Date(Date.now() - 86400000);

  const [delta] = await db
    .select({
      bronze: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${S.bronzeEvent.payloadBytes}),0)::int`,
    })
    .from(S.bronzeEvent)
    .where(gte(S.bronzeEvent.ingestTime, watermark));

  let recordsOut = delta?.bronze ?? 0;
  let rejected = 0;
  if (cfg.layer === "silver") {
    const [dq] = await db.select({ failed: sql<number>`coalesce(sum(${S.dqCheck.recordsFailed}),0)::int`, tested: sql<number>`coalesce(sum(${S.dqCheck.recordsTested}),0)::int` }).from(S.dqCheck);
    const rate = dq && dq.tested > 0 ? dq.failed / dq.tested : 0.002;
    rejected = Math.round((delta?.bronze ?? 0) * rate);
    recordsOut = Math.max(0, (delta?.bronze ?? 0) - rejected);
  } else if (cfg.layer === "gold") {
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(S.factClaims);
    recordsOut = n?.n ?? 0;
  } else if (cfg.layer === "actuarial") {
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(S.reserveResult);
    recordsOut = n?.n ?? 0;
  }

  const durationMs = Math.round(performance.now() - t0) + Math.round(300 + Math.random() * 1400);
  const run = {
    runId: `run_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${dagId}_manual_${Date.now()}`,
    dagId,
    taskName: cfg.task,
    layer: cfg.layer,
    engine: cfg.engine,
    status: "success",
    mode: cfg.mode,
    startedAt: new Date(),
    durationMs,
    recordsIn: delta?.bronze ?? 0,
    recordsOut,
    recordsRejected: rejected,
    watermark: watermark.toISOString().slice(0, 19).replace("T", " "),
    logicalDate: new Date().toISOString().slice(0, 10),
  };
  await db.insert(S.pipelineRun).values(run);
  await db.insert(S.streamMetric).values({
    id: `SM-MAN-${Date.now()}`,
    topic: cfg.topic,
    ts: new Date(),
    eventsPerSec: Number((20 + Math.random() * 60).toFixed(1)),
    lag: Math.round(180 + Math.random() * 600),
    p95LatencyMs: durationMs,
    partitions: 12,
    offset: Math.round(40_000_000 + Math.random() * 1_000_000),
  });

  return NextResponse.json({
    ok: true,
    run,
    incremental: {
      watermark: run.watermark,
      newRecords: delta?.bronze ?? 0,
      newBytes: delta?.bytes ?? 0,
      rejected,
      note: cfg.layer === "silver" ? "only new + changed records processed (CDC watermark) — no full-table rewrite" : "partition-pruned incremental merge",
    },
  });
}

export async function GET() {
  const runs = await db.select().from(S.pipelineRun).orderBy(desc(S.pipelineRun.startedAt)).limit(20);
  const [agg] = await db.select({ n: sql<number>`count(*)::int`, failed: sql<number>`sum(case when ${S.pipelineRun.status} = 'failed' then 1 else 0 end)::int` }).from(S.pipelineRun);
  return NextResponse.json({ runs, agg });
}
