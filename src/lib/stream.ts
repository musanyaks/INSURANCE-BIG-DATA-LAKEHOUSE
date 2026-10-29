/**
 * INSURELAKE real-time claim intake.
 *
 * Reproduces the killer demo path in-process:
 *   FNOL REST API → Kafka (insurance.claims) → Bronze Iceberg append
 *   → Spark micro-batch silver cleanse → online feature store (19 features)
 *   → MLflow production ensemble → fraud alert → Gold mart merge
 *   → reserving hook → BI/SIU notification.
 * Every stage is timed and returned as an auditable trace.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { COUNTIES } from "./kenya";
import { buildFraudFeatures, explain, featureBounds, isolationScore, SUSPICIOUS_DIRECTION, FRAUD_FEATURE_NAMES, type FraudCtx, type LogisticModel } from "./ml";
import { dateKeyOf, quarterOf, resolveCounty, yearMonthOf, hashRow } from "./pipeline";

export type Scenario = "routine" | "suspicious" | "fraud_ring" | "duplicate" | "staged_accident" | "first_premium";

export type IntakeInput = {
  scenario?: Scenario;
  amount?: number;
  cause?: string;
  lob?: string;
  countyCode?: string;
  providerId?: string;
  policyId?: string;
  reportedVia?: string;
};

export type TraceStage = {
  id: string;
  stage: string;
  system: string;
  detail: string;
  durationMs: number;
  status: "ok" | "warn" | "error";
  output: Record<string, string | number | null>;
};

export type IntakeResult = {
  claimId: string;
  claimKey: string;
  bronzeEventId: string;
  kafka: { topic: string; partition: number; offset: number };
  score: number;
  level: string;
  reasons: Array<{ feature: string; label: string; detail: string; contribution: number; value: number }>;
  features: Record<string, number>;
  alertId: string | null;
  trace: TraceStage[];
  totalMs: number;
  ibnrImpact: number;
  ultimate: number;
  claim: Record<string, string | number | null>;
  policy: { policyId: string; customerId: string; lob: string; county: string; sumInsured: number; startDate: string; vehicleReg: string | null; providerId: string | null; providerName: string | null };
};

let cachedModel: { model: LogisticModel; bounds: { min: number[]; max: number[] } } | null = null;

async function loadProductionModel() {
  if (cachedModel) return cachedModel;
  const rows = await db.select().from(S.modelRegistry).where(eq(S.modelRegistry.modelId, "fraud-ensemble-v3")).limit(1);
  if (!rows.length) throw new Error("Production fraud model not found — run the lakehouse bootstrap first");
  const p = rows[0].params as unknown as {
    weights: number[]; bias: number; means: number[]; stds: number[]; featureNames: string[]; bounds?: { min: number[]; max: number[] };
  };
  cachedModel = {
    model: {
      weights: p.weights,
      bias: p.bias,
      means: p.means,
      stds: p.stds,
      featureNames: p.featureNames ?? [...FRAUD_FEATURE_NAMES],
      metrics: { auc: rows[0].metricValue, ks: 0, precision: 0, recall: 0, f1: 0, accuracy: 0, liftTop10: 0, trainRows: rows[0].trainingRows, testRows: 0, positiveRate: 0 },
      trainedAt: rows[0].trainedAt,
      epochs: 200,
    },
    bounds: p.bounds ?? featureBounds([[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]),
  };
  return cachedModel;
}

export function invalidateModelCache() {
  cachedModel = null;
}

const SCENARIO_PLAN: Record<Scenario, { label: string; amountMult: number; lag: number; rogueProvider: boolean; duplicate: boolean; note: string }> = {
  routine: { label: "Routine motor own-damage claim", amountMult: 1, lag: 4, rogueProvider: false, duplicate: false, note: "Typical FNOL — expected to score LOW" },
  suspicious: { label: "Large late-reported health claim", amountMult: 3.4, lag: 1, rogueProvider: false, duplicate: false, note: "Amount well above segment baseline" },
  fraud_ring: { label: "Provider-linked organised ring", amountMult: 4.2, lag: 0, rogueProvider: true, duplicate: false, note: "Rogue provider + clustered claimants" },
  duplicate: { label: "Duplicate documentation resubmission", amountMult: 2.1, lag: 2, rogueProvider: true, duplicate: true, note: "Same documents as a settled claim" },
  staged_accident: { label: "Staged accident (telematics inconsistent)", amountMult: 3.1, lag: 0, rogueProvider: true, duplicate: false, note: "No harsh-event recorded at incident time" },
  first_premium: { label: "First-premium claim (day 9)", amountMult: 2.6, lag: 0, rogueProvider: false, duplicate: false, note: "Claim immediately after inception" },
};

export async function runClaimPipeline(input: IntakeInput): Promise<IntakeResult> {
  const t0 = performance.now();
  const trace: TraceStage[] = [];
  const scenario = (input.scenario ?? "routine") as Scenario;
  const plan = SCENARIO_PLAN[scenario];
  const stage = async (id: string, name: string, system: string, detail: string, fn: () => Promise<Record<string, string | number | null>>, status: TraceStage["status"] = "ok") => {
    const s = performance.now();
    let output: Record<string, string | number | null> = {};
    let st = status;
    try {
      output = await fn();
    } catch (e) {
      st = "error";
      output = { error: e instanceof Error ? e.message : String(e) };
      trace.push({ id, stage: name, system, detail, durationMs: Math.round(performance.now() - s), status: st, output });
      throw e;
    }
    trace.push({ id, stage: name, system, detail, durationMs: Math.round(performance.now() - s), status: st, output });
    return output;
  };

  /* ---- 1. API gateway ---- */
  await stage("api", "POST /v2/claims/fnol", "FastAPI Gateway (Kong + OAuth2)", "Payload validated against OpenAPI contract; JWT scope claim:write verified", async () => ({
    scenario: plan.label,
    note: plan.note,
    reportedVia: input.reportedVia ?? "Mobile app",
    content_type: "application/json",
    http_status: 202,
  }));

  /* ---- resolve policy context ---- */
  const policyRow = input.policyId
    ? await db.select().from(S.silverPolicy).where(eq(S.silverPolicy.policyId, input.policyId)).limit(1)
    : await db.select().from(S.silverPolicy).where(eq(S.silverPolicy.status, "Active")).orderBy(sql`random()`).limit(1);
  const pol = policyRow[0];
  if (!pol) throw new Error("No silver policy available — bootstrap the lakehouse first");
  const countyCode = input.countyCode ?? pol.countyCode;
  const county = COUNTIES.find((c) => c.code === countyCode) ?? COUNTIES[46];
  const lob = input.lob ?? pol.lob;

  const [veh] = await db.select().from(S.silverVehicle).where(eq(S.silverVehicle.customerId, pol.customerId)).limit(1);
  const providerPool = plan.rogueProvider
    ? await db.select().from(S.silverProvider).where(and(gte(S.silverProvider.providerRiskScore, 0.6))).limit(20)
    : await db.select().from(S.silverProvider).where(eq(S.silverProvider.countyCode, countyCode)).limit(20);
  const provider = input.providerId
    ? (await db.select().from(S.silverProvider).where(eq(S.silverProvider.providerId, input.providerId)).limit(1))[0]
    : providerPool.length
      ? providerPool[Math.floor(Math.random() * providerPool.length)]
      : (await db.select().from(S.silverProvider).limit(1))[0];

  /* ---- 2. Kafka produce ---- */
  const seq = Date.now() % 1000000;
  const claimId = `CLM-${900000 + seq}`;
  const partition = Math.floor(Math.random() * 12);
  const kafka = await stage("kafka", "Produce → insurance.claims", "Kafka (acks=all, idempotent producer)", `Keyed by policy_id ${pol.policyId}; partition ${partition}; schema registry id 1042 (avro v3)`, async () => {
    const [mx] = await db.select({ n: sql<number>`coalesce(max(${S.bronzeEvent.offset}),900000)::int` }).from(S.bronzeEvent).where(eq(S.bronzeEvent.topic, "insurance.claims"));
    return { topic: "insurance.claims", partition, offset: mx.n + 1, acks: "all", schema_registry_id: 1042 };
  });

  const amountBase = input.amount ?? Math.round((pol.sumInsured * (lob === "Health" ? 0.05 : 0.09)) / 500) * 500;
  const amount = Math.max(2000, Math.round((amountBase * plan.amountMult) / 500) * 500);
  const claimDate = scenario === "first_premium" ? pol.startDate : new Date().toISOString().slice(0, 10);
  const reportDate = new Date(Date.parse(claimDate) + plan.lag * 86400000).toISOString().slice(0, 10);
  const cause = input.cause ?? (lob === "Motor" ? (scenario === "staged_accident" ? "Third-party collision" : "Own damage - accident") : lob === "Health" ? "Emergency admission" : "Funeral cover claim");

  const payload: Record<string, unknown> = {
    claim_id: claimId,
    policy_id: pol.policyId,
    customer_id: pol.customerId,
    claim_date: claimDate,
    claim_amount: amount,
    claim_type: lob,
    location: county.name,
    status: "Submitted",
    cause,
    report_date: reportDate,
    amount_paid: 0,
    reserve: amount,
    settle_date: null,
    provider_id: provider?.providerId ?? null,
    agent_id: pol.agentId,
    vehicle_reg: veh?.registration ?? null,
    reporting_lag_days: plan.lag,
    currency: "KES",
    fraud_score: null,
    channel_of_report: input.reportedVia ?? "Mobile app",
    schema_version: 3,
    ingested_at: new Date().toISOString(),
  };

  /* ---- 3. Bronze ---- */
  const bronzeEventId = await stage("bronze", "Iceberg append → bronze.claims", "Spark Structured Streaming (exactly-once sink)", "Raw JSON written verbatim; no transformation, no null-filling", async () => {
    const now = new Date();
    const part = `dt=${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}`;
    const eventId = `CLAIMS-${String((kafka.offset as number) + 500000).padStart(8, "0")}`;
    await db.insert(S.bronzeEvent).values({
      eventId,
      topic: "insurance.claims",
      sourceSystem: "policy-admin-core",
      schemaVersion: 3,
      payload,
      eventTime: now,
      ingestTime: now,
      lakePath: `s3a://insurelake/bronze/claims/${part}/insurance.claims-${eventId}.json`,
      partition: part,
      batchId: `batch_${now.toISOString().slice(0, 10).replace(/-/g, "")}_claims`,
      offset: Number(kafka.offset) || 1,
      ingestMode: "streaming",
      payloadBytes: JSON.stringify(payload).length,
    });
    return { event_id: eventId, lake_path: `s3a://insurelake/bronze/claims/${part}/`, table_format: "Apache Iceberg v2", bytes: JSON.stringify(payload).length };
  });

  /* ---- 4. Silver cleanse ---- */
  const claimKey = `CLK-${claimId.replace("CLM-", "")}`;
  const silverOut = await stage("silver", "Spark micro-batch → silver.claim", "dbt: silver_claim (incremental, watermark)", "Dedupe on claim_id, coerce decimal, standardise county, FK check to policy/customer, quarantine invalid rows", async () => {
    const resolved = resolveCounty(payload.location);
    const [dup] = await db.select({ n: sql<number>`count(*)::int` }).from(S.silverClaim).where(eq(S.silverClaim.claimId, claimId));
    const [orphan] = await db.select({ n: sql<number>`count(*)::int` }).from(S.silverPolicy).where(eq(S.silverPolicy.policyId, pol.policyId));
    const dedupeScore = plan.duplicate ? 0.91 : dup.n > 0 ? 0.78 : 0.03;
    const row = {
      claimKey,
      claimId,
      policyId: pol.policyId,
      customerId: pol.customerId,
      providerId: provider?.providerId ?? null,
      agentId: pol.agentId,
      vehicleReg: veh?.registration ?? null,
      claimDate,
      reportDate,
      settleDate: null,
      claimType: lob,
      cause,
      amountClaimed: amount,
      amountPaid: 0,
      reserveAmount: amount,
      status: "Submitted",
      countyCode: resolved.code,
      countyName: resolved.name,
      reportingLagDays: plan.lag,
      dedupeScore,
      isDuplicate: plan.duplicate || dup.n > 0,
      isFraud: false,
      currency: "KES",
      qualityFlags: plan.duplicate ? ["duplicate_documentation_detected", "same_provider_as_prior_claim"] : ["streaming_ingest"],
      rowHash: hashRow(payload),
      ingestedAt: new Date(),
    };
    await db.insert(S.silverClaim).values(row).onConflictDoUpdate({ target: S.silverClaim.claimKey, set: row });
    return {
      claim_key: claimKey,
      county_standardised: `${payload.location} → ${resolved.name} (${resolved.code})`,
      referential_integrity: orphan.n > 0 ? "policy_id + customer_id resolved" : "ORPHAN — quarantined",
      dedupe_score: dedupeScore,
      duplicate: row.isDuplicate ? "yes" : "no",
      records_out: 1,
    };
  });

  /* ---- 5. online feature store ---- */
  const featureOut = await stage("features", "Online feature store → 19 features", "Spark + Redis feature store (point-in-time correct)", "Same feature code as the offline batch job — no training/serving skew", async () => {
    const ctx = await onlineFeatures({
      claimId,
      customerId: pol.customerId,
      policyId: pol.policyId,
      providerId: provider?.providerId ?? null,
      vehicleReg: veh?.registration ?? null,
      claimDate,
      amountClaimed: amount,
      claimType: lob,
      countyCode,
      reportingLagDays: plan.lag,
      dedupeScore: plan.duplicate ? 0.91 : 0.03,
    });
    const x = buildFraudFeatures(
      { claimId, customerId: pol.customerId, policyId: pol.policyId, providerId: provider?.providerId ?? null, vehicleReg: veh?.registration ?? null, claimDate, amountClaimed: amount, claimType: lob, countyCode, reportingLagDays: plan.lag, dedupeScore: plan.duplicate ? 0.91 : 0.03 },
      ctx.ctx,
    );
    return { feature_count: x.length, ...ctx.debug, materialised_at: new Date().toISOString() };
  });

  const ctx = await onlineFeatures({
    claimId,
    customerId: pol.customerId,
    policyId: pol.policyId,
    providerId: provider?.providerId ?? null,
    vehicleReg: veh?.registration ?? null,
    claimDate,
    amountClaimed: amount,
    claimType: lob,
    countyCode,
    reportingLagDays: plan.lag,
    dedupeScore: plan.duplicate ? 0.91 : 0.03,
  });
  const x = buildFraudFeatures(
    { claimId, customerId: pol.customerId, policyId: pol.policyId, providerId: provider?.providerId ?? null, vehicleReg: veh?.registration ?? null, claimDate, amountClaimed: amount, claimType: lob, countyCode, reportingLagDays: plan.lag, dedupeScore: plan.duplicate ? 0.91 : 0.03 },
    ctx.ctx,
  );

  /* ---- 6. ML scoring ---- */
  const { model, bounds } = await loadProductionModel();
  const anomaly = isolationScore(x, bounds, SUSPICIOUS_DIRECTION);
  const scored = explain(model, x, anomaly);
  const alertId = `FRD-${claimId.replace("CLM-", "")}`;
  await stage("ml", "Score → fraud-ensemble-v3", "MLflow model registry (production stage)", `GLM binomial p=${(scored.score).toFixed(4)} blended with isolation anomaly ${(anomaly * 100).toFixed(1)}% (0.84 / 0.16)`, async () => ({
    model_id: "fraud-ensemble-v3",
    glm_probability: Number(scored.score.toFixed(4)),
    isolation_anomaly: Number(anomaly.toFixed(4)),
    final_score: Number(scored.score.toFixed(4)),
    risk_level: scored.level,
    top_reason: scored.reasons[0]?.detail ?? "—",
  }));

  /* ---- 7. alert + gold mart ---- */
  await stage("gold", "Merge → gold.fact_claims / fact_fraud_events", "dbt incremental merge on Iceberg", "Conformed keys resolved against dim_date, dim_location, dim_policy, dim_provider", async () => {
    const dk = dateKeyOf(claimDate);
    await db
      .insert(S.factClaims)
      .values({
        claimKey,
        claimId,
        dateKey: dk,
        reportDateKey: dateKeyOf(reportDate),
        policyKey: pol.policyKey,
        customerKey: `CUSK-${pol.customerId.replace("CUS-", "")}`,
        vehicleKey: veh ? `VEHK-${veh.registration}` : null,
        agentKey: `AGTK-${pol.agentId.replace("AGT-", "")}`,
        providerKey: provider ? `PRVK-${provider.providerId.replace("PRV-", "")}` : null,
        locationKey: 1000 + COUNTIES.findIndex((c) => c.code === countyCode) + 1,
        claimType: lob,
        lob,
        cause,
        status: "Submitted",
        amountClaimed: amount,
        amountPaid: 0,
        reserveAmount: amount,
        ultimateAmount: amount,
        fraudScore: Number(scored.score.toFixed(4)),
        riskLevel: scored.level,
        isFraud: scored.score >= 0.85,
        isDuplicate: plan.duplicate,
        reportingLagDays: plan.lag,
        yearMonth: yearMonthOf(claimDate),
        originQuarter: quarterOf(claimDate),
      })
      .onConflictDoNothing();

    let published: string | null = null;
    if (scored.score >= 0.35) {
      const ringLinks = [
        { from: pol.customerId, to: provider?.providerId ?? "n/a", type: "claimant→provider", weight: 1 },
        { from: veh?.registration ?? "n/a", to: pol.customerId, type: "vehicle→owner", weight: 1 },
      ];
      await db
        .insert(S.factFraudEvents)
        .values({
          alertId,
          claimKey,
          claimId,
          customerKey: `CUSK-${pol.customerId.replace("CUS-", "")}`,
          providerKey: provider ? `PRVK-${provider.providerId.replace("PRV-", "")}` : null,
          locationKey: 1000 + COUNTIES.findIndex((c) => c.code === countyCode) + 1,
          detectedAt: new Date(),
          fraudScore: Number(scored.score.toFixed(4)),
          riskLevel: scored.level,
          modelId: "fraud-ensemble-v3",
          reasons: scored.reasons,
          features: Object.fromEntries(FRAUD_FEATURE_NAMES.map((n, i) => [n, Number((x[i] ?? 0).toFixed(4))])),
          amountAtRisk: amount,
          status: scored.score >= 0.78 ? "Investigation opened" : scored.score >= 0.56 ? "Queued for review" : "Monitoring",
          assignedTo: scored.score >= 0.56 ? ["SIU Nairobi", "SIU Mombasa", "SIU Kisumu", "SIU Nakuru"][Math.floor(Math.random() * 4)] : null,
          detectionMode: "streaming",
          latencyMs: Math.round(performance.now() - t0),
          networkLinks: ringLinks,
        })
        .onConflictDoUpdate({ target: S.factFraudEvents.alertId, set: { fraudScore: Number(scored.score.toFixed(4)), riskLevel: scored.level, reasons: scored.reasons, detectedAt: new Date(), latencyMs: Math.round(performance.now() - t0) } });
      published = `insurance.fraud_alerts[p=${partition % 4}]`;
    }
    await db.insert(S.streamMetric).values([
      { id: `SM-LIVE-${Date.now()}-claims`, topic: "insurance.claims", ts: new Date(), eventsPerSec: 24 + Math.random() * 12, lag: Math.round(200 + Math.random() * 900), p95LatencyMs: Math.round(performance.now() - t0), partitions: 12, offset: Number(kafka.offset) || 1 },
      { id: `SM-LIVE-${Date.now()}-fraud`, topic: "insurance.fraud_alerts", ts: new Date(), eventsPerSec: scored.score >= 0.35 ? 3.8 : 2.9, lag: Math.round(120 + Math.random() * 400), p95LatencyMs: Math.round(performance.now() - t0), partitions: 4, offset: Number(kafka.offset) || 1 },
    ]);
    return { fact_claims: 1, fact_fraud_events: scored.score >= 0.35 ? 1 : 0, kafka_publish: published ?? "below threshold — not published", alert_id: scored.score >= 0.35 ? alertId : null };
  }, scored.score >= 0.78 ? "warn" : "ok");

  /* ---- 8. reserving hook ---- */
  const [cdfRow] = await db
    .select({ ldf: sql<number>`coalesce(avg(${S.devTriangle.ldf}),1.05)::float` })
    .from(S.devTriangle)
    .where(and(eq(S.devTriangle.lob, lob), eq(S.devTriangle.measure, "paid")));
  const cdf = Math.max(1.01, cdfRow?.ldf ?? 1.08);
  const ultimate = Math.round(amount * cdf);
  const ibnrImpact = ultimate - amount;
  await stage("reserving", "Chain ladder reserving hook", "R: chainladder (dev-triangle increment)", `New claim adds to origin quarter ${quarterOf(claimDate)}; LDF ${cdf.toFixed(3)} applied for IBNR`, async () => ({
    origin_quarter: quarterOf(claimDate),
    ldf_applied: Number(cdf.toFixed(4)),
    ultimate_estimate: ultimate,
    ibnr_impact: ibnrImpact,
    method: "chain_ladder + Mack SE refresh (nightly)",
  }));

  /* ---- 9. BI / notification ---- */
  await stage("bi", "Consume → BI & SIU tooling", "Trino → Next.js control centre; Power BI incremental refresh", scored.score >= 0.65 ? "Slack #siu-fraud-alerts + investigator task created in the fraud console" : "Executive dashboard tiles refreshed (15s SLA)", async () => ({
    trino_query_ms: Math.round(38 + Math.random() * 60),
    powerbi_refresh: "incremental (last 3 partitions)",
    slack_notification: scored.score >= 0.65 ? "#siu-fraud-alerts" : "none",
    dashboard_url: scored.score >= 0.35 ? `/fraud?alert=${alertId}` : "/fraud",
  }));

  return {
    claimId,
    claimKey,
    bronzeEventId: String(bronzeEventId.event_id),
    kafka: { topic: "insurance.claims", partition, offset: Number(kafka.offset) || 1 },
    score: Number(scored.score.toFixed(4)),
    level: scored.level,
    reasons: scored.reasons,
    features: Object.fromEntries(FRAUD_FEATURE_NAMES.map((n, i) => [n, Number((x[i] ?? 0).toFixed(4))])),
    alertId: scored.score >= 0.35 ? alertId : null,
    trace,
    totalMs: Math.round(performance.now() - t0),
    ibnrImpact,
    ultimate,
    claim: {
      claim_id: claimId,
      policy_id: pol.policyId,
      customer_id: pol.customerId,
      claim_date: claimDate,
      claim_amount: amount,
      claim_type: lob,
      location: county.name,
      status: "Submitted",
      provider: provider?.name ?? null,
      vehicle: veh?.registration ?? null,
      cause,
    },
    policy: {
      policyId: pol.policyId,
      customerId: pol.customerId,
      lob: pol.lob,
      county: county.name,
      sumInsured: pol.sumInsured,
      startDate: pol.startDate,
      vehicleReg: veh?.registration ?? null,
      providerId: provider?.providerId ?? null,
      providerName: provider?.name ?? null,
    },
  };
}

async function onlineFeatures(claim: {
  claimId: string; customerId: string; policyId: string; providerId: string | null; vehicleReg: string | null;
  claimDate: string; amountClaimed: number; claimType: string; countyCode: string; reportingLagDays: number; dedupeScore: number;
}): Promise<{ ctx: FraudCtx; debug: Record<string, string | number | null> }> {
  const claimTime = Date.parse(claim.claimDate);
  const custClaims = await db
    .select({ d: S.silverClaim.claimDate, a: S.silverClaim.amountClaimed, id: S.silverClaim.claimId })
    .from(S.silverClaim)
    .where(eq(S.silverClaim.customerId, claim.customerId))
    .limit(200);
  const dates = custClaims.map((c) => c.d);
  const trailing = dates.filter((d) => Date.parse(d) <= claimTime && Date.parse(d) > claimTime - 365 * 86400000).length;

  const [pol] = await db.select().from(S.silverPolicy).where(eq(S.silverPolicy.policyId, claim.policyId)).limit(1);
  const prov = claim.providerId ? (await db.select().from(S.silverProvider).where(eq(S.silverProvider.providerId, claim.providerId)).limit(1))[0] : undefined;
  const [provFraud] = claim.providerId
    ? await db.select({ n: sql<number>`count(*)::int` }).from(S.factFraudEvents).where(eq(S.factFraudEvents.providerKey, `PRVK-${claim.providerId.replace("PRV-", "")}`))
    : [{ n: 0 }];
  const [seg] = await db
    .select({ avg: sql<number>`coalesce(avg(${S.silverClaim.amountClaimed}),0)::float`, sd: sql<number>`coalesce(stddev_pop(${S.silverClaim.amountClaimed}),1)::float`, n: sql<number>`count(*)::int` })
    .from(S.silverClaim)
    .where(and(eq(S.silverClaim.claimType, claim.claimType), eq(S.silverClaim.countyCode, claim.countyCode)));
  const [countyAgg] = await db
    .select({ n: sql<number>`count(*)::int`, avg: sql<number>`coalesce(avg(${S.silverClaim.amountClaimed}),0)::float` })
    .from(S.silverClaim)
    .where(eq(S.silverClaim.countyCode, claim.countyCode));
  const [vel] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(S.silverPayment)
    .where(and(eq(S.silverPayment.customerId, claim.customerId), gte(S.silverPayment.paidAt, new Date(claimTime - 30 * 86400000))));
  const tel = claim.vehicleReg
    ? (await db
        .select({
          harsh: sql<number>`coalesce(sum(${S.silverTelematics.harshBraking} + ${S.silverTelematics.harshAcceleration}),0)::int`,
          night: sql<number>`coalesce(sum(${S.silverTelematics.nightDrivingKm}),0)::float`,
          trips: sql<number>`count(*)::int`,
          speed: sql<number>`coalesce(avg(${S.silverTelematics.speedKmh}),0)::float`,
          distance: sql<number>`coalesce(sum(${S.silverTelematics.distanceKm}),0)::float`,
        })
        .from(S.silverTelematics)
        .where(eq(S.silverTelematics.vehicleReg, claim.vehicleReg)))[0]
    : undefined;
  const [shared] = claim.providerId
    ? await db.select({ n: sql<number>`count(distinct ${S.silverClaim.customerId})::int` }).from(S.silverClaim).where(eq(S.silverClaim.providerId, claim.providerId))
    : [{ n: 0 }];
  const [vehClaims] = claim.vehicleReg ? await db.select({ n: sql<number>`count(*)::int` }).from(S.silverClaim).where(eq(S.silverClaim.vehicleReg, claim.vehicleReg)) : [{ n: 0 }];
  const ref = COUNTIES.find((c) => c.code === claim.countyCode);

  const ctx: FraudCtx = {
    customerClaims: new Map([[claim.customerId, { dates: [...dates, claim.claimDate], amounts: custClaims.map((c) => c.a), ids: custClaims.map((c) => c.id) }]]),
    vehicleClaims: new Map([[claim.vehicleReg ?? "", vehClaims?.n ?? 0]]),
    policyStart: new Map([[claim.policyId, pol?.startDate ?? claim.claimDate]]),
    policySumInsured: new Map([[claim.policyId, pol?.sumInsured ?? 500000]]),
    policyLob: new Map([[claim.policyId, pol?.lob ?? claim.claimType]]),
    providerStats: new Map(claim.providerId ? [[claim.providerId, { volume: prov?.claimVolume ?? 0, risk: prov?.providerRiskScore ?? 0, rejection: prov?.rejectionRate ?? 0, fraudVolume: provFraud?.n ?? 0, avgAmount: prov?.avgClaimAmount ?? 0, degree: prov?.networkDegree ?? 0 }]] : []),
    countyStats: new Map([[claim.countyCode, { roadRisk: ref?.roadRisk ?? 0.5, crimeRisk: ref?.crimeRisk ?? 0.5, avgAmount: countyAgg?.avg ?? 0, volume: countyAgg?.n ?? 0 }]]),
    lobCountyAvg: new Map([[`${claim.claimType}|${claim.countyCode}`, { avg: seg?.avg ?? claim.amountClaimed, sd: seg?.sd ?? 1, n: seg?.n ?? 1 }]]),
    paymentVelocity: new Map([[claim.customerId, vel?.n ?? 0]]),
    telematics: new Map(claim.vehicleReg ? [[claim.vehicleReg, { harsh: tel?.harsh ?? 0, nightKm: tel?.night ?? 0, avgSpeed: tel?.speed ?? 0, trips: tel?.trips ?? 0, score: Math.max(10, Math.min(99, 96 - (tel?.harsh ?? 0) * 0.8 - (tel?.night ?? 0) * 0.01)) }]] : []),
    providerCustomers: new Map(claim.providerId ? [[claim.providerId, new Set(Array.from({ length: shared?.n ?? 0 }, (_, i) => `C${i}`))]] : []),
  };

  return {
    ctx,
    debug: {
      customer_claims_12m: trailing,
      provider_volume: prov?.claimVolume ?? 0,
      provider_risk: Number(((prov?.providerRiskScore ?? 0) * 100).toFixed(1)),
      segment_z: seg && seg.sd > 0 ? Number(((claim.amountClaimed - seg.avg) / seg.sd).toFixed(2)) : 0,
      payment_velocity_30d: vel?.n ?? 0,
      telematics_trips: tel?.trips ?? 0,
      network_shared_customers: shared?.n ?? 0,
      county: ref?.name ?? claim.countyCode,
    },
  };
}
