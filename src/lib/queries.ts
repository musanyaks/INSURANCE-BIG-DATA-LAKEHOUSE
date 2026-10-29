import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { COUNTIES } from "./kenya";

export type BootstrapStats = Record<string, string | number | undefined> & { seededAt?: string };

export async function platformStats(): Promise<BootstrapStats | null> {
  const rows = await db.select().from(S.platformState).where(eq(S.platformState.key, "bootstrap")).limit(1);
  if (!rows.length) return null;
  return rows[0].value as unknown as BootstrapStats;
}

export const kes = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-KE", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.round(n * 100) / 100);

export function compactKes(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `KSh ${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `KSh ${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `KSh ${(n / 1e3).toFixed(0)}k`;
  return `KSh ${Math.round(n)}`;
}

export async function layerCounts() {
  const [bronze] = await db.select({ n: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${S.bronzeEvent.payloadBytes}),0)::bigint` }).from(S.bronzeEvent);
  const counts: Record<string, number> = {};
  const pairs = [
    ["silver_customer", S.silverCustomer], ["silver_policy", S.silverPolicy], ["silver_claim", S.silverClaim], ["silver_payment", S.silverPayment],
    ["silver_vehicle", S.silverVehicle], ["silver_provider", S.silverProvider], ["silver_agent", S.silverAgent], ["silver_telematics", S.silverTelematics],
    ["fact_claims", S.factClaims], ["fact_premiums", S.factPremiums], ["fact_payments", S.factPayments], ["fact_fraud_events", S.factFraudEvents],
    ["fact_vehicle_events", S.factVehicleEvents], ["dim_date", S.dimDate], ["dim_location", S.dimLocation], ["dev_triangle", S.devTriangle],
    ["reserve_result", S.reserveResult], ["pricing_segment", S.pricingSegment],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as Array<[string, any]>;
  for (const [name, table] of pairs) {
    const r = await db.select({ n: sql<number>`count(*)::int` }).from(table);
    counts[name] = r[0]?.n ?? 0;
  }
  return { bronze: bronze?.n ?? 0, bronzeBytes: Number(bronze?.bytes ?? 0), counts };
}

/* ------------------------------------------------------------------ *
 * Executive summary
 * ------------------------------------------------------------------ */

export async function executiveSummary() {
  const premiumRows = await db
    .select({ ym: S.factPremiums.yearMonth, earned: sql<number>`sum(${S.factPremiums.earnedPremium})::float`, written: sql<number>`sum(${S.factPremiums.writtenPremium})::float`, inForce: sql<number>`sum(${S.factPremiums.policiesInForce})::int` })
    .from(S.factPremiums)
    .groupBy(S.factPremiums.yearMonth)
    .orderBy(S.factPremiums.yearMonth);
  const claimRows = await db
    .select({ ym: S.factClaims.yearMonth, incurred: sql<number>`sum(${S.factClaims.ultimateAmount})::float`, paid: sql<number>`sum(${S.factClaims.amountPaid})::float`, n: sql<number>`count(*)::int`, fraud: sql<number>`sum(case when ${S.factClaims.riskLevel} in ('HIGH','CRITICAL') then ${S.factClaims.amountClaimed} else 0 end)::float` })
    .from(S.factClaims)
    .groupBy(S.factClaims.yearMonth)
    .orderBy(S.factClaims.yearMonth);
  const claimByYm = new Map(claimRows.map((c) => [c.ym, c]));
  const trend = premiumRows.map((p) => {
    const c = claimByYm.get(p.ym);
    const incurred = c?.incurred ?? 0;
    return {
      month: p.ym,
      earnedPremium: Math.round(p.earned),
      writtenPremium: Math.round(p.written),
      incurredClaims: Math.round(incurred),
      paidClaims: Math.round(c?.paid ?? 0),
      claimCount: c?.n ?? 0,
      lossRatio: p.earned > 0 ? Number(((incurred / p.earned) * 100).toFixed(1)) : 0,
      policiesInForce: p.inForce,
      fraudExposure: Math.round(c?.fraud ?? 0),
    };
  });
  const last12 = trend.slice(-12);
  const gwp = last12.reduce((s, x) => s + x.earnedPremium, 0);
  const incurred = last12.reduce((s, x) => s + x.incurredClaims, 0);
  const fraudExposure = last12.reduce((s, x) => s + x.fraudExposure, 0);
  const claimCount = last12.reduce((s, x) => s + x.claimCount, 0);

  const [totals] = await db
    .select({
      claimsAll: sql<number>`count(*)::int`,
      openClaims: sql<number>`sum(case when ${S.factClaims.status} not in ('Paid','Closed - Settled','Rejected') then 1 else 0 end)::int`,
      reserves: sql<number>`coalesce(sum(${S.factClaims.reserveAmount}),0)::float`,
      fraudConfirmed: sql<number>`sum(case when ${S.factClaims.isFraud} then 1 else 0 end)::int`,
      avgScore: sql<number>`avg(${S.factClaims.fraudScore})::float`,
    })
    .from(S.factClaims);

  const [ibnr] = await db
    .select({ ibnr: sql<number>`coalesce(sum(${S.reserveResult.ibnr}),0)::float`, ultimate: sql<number>`coalesce(sum(${S.reserveResult.ultimate}),0)::float`, se: sql<number>`coalesce(max(${S.reserveResult.mackStdError}),0)::float` })
    .from(S.reserveResult)
    .where(eq(S.reserveResult.method, "chain_ladder"));

  const [bfRow] = await db.select({ ibnr: sql<number>`coalesce(sum(${S.reserveResult.ibnr}),0)::float` }).from(S.reserveResult).where(eq(S.reserveResult.method, "bornhuetter_ferguson"));
  const [ccRow] = await db.select({ ibnr: sql<number>`coalesce(sum(${S.reserveResult.ibnr}),0)::float` }).from(S.reserveResult).where(eq(S.reserveResult.method, "cape_cod"));

  const lobRows = await db
    .select({ lob: S.factClaims.lob, claims: sql<number>`count(*)::int`, incurred: sql<number>`sum(${S.factClaims.ultimateAmount})::float`, fraud: sql<number>`avg(${S.factClaims.fraudScore})::float` })
    .from(S.factClaims)
    .groupBy(S.factClaims.lob)
    .orderBy(desc(sql`count(*)`));

  const premiumLob = await db.select({ lob: S.factPremiums.lob, earned: sql<number>`sum(${S.factPremiums.earnedPremium})::float` }).from(S.factPremiums).groupBy(S.factPremiums.lob);
  const premByLob = new Map(premiumLob.map((p) => [p.lob, p.earned]));

  const fraudLevels = await db.select({ level: S.factFraudEvents.riskLevel, n: sql<number>`count(*)::int`, amount: sql<number>`sum(${S.factFraudEvents.amountAtRisk})::float` }).from(S.factFraudEvents).groupBy(S.factFraudEvents.riskLevel);

  const countyRows = await db
    .select({
      code: S.dimLocation.countyCode,
      name: S.dimLocation.countyName,
      riskZone: S.dimLocation.riskZone,
      lat: S.dimLocation.latitude,
      lng: S.dimLocation.longitude,
      claims: sql<number>`count(${S.factClaims.claimKey})::int`,
      incurred: sql<number>`coalesce(sum(${S.factClaims.ultimateAmount}),0)::float`,
      fraud: sql<number>`coalesce(avg(${S.factClaims.fraudScore}),0)::float`,
    })
    .from(S.dimLocation)
    .leftJoin(S.factClaims, eq(S.factClaims.locationKey, S.dimLocation.locationKey))
    .groupBy(S.dimLocation.countyCode, S.dimLocation.countyName, S.dimLocation.riskZone, S.dimLocation.latitude, S.dimLocation.longitude);
  const countyPrem = await db.select({ key: S.factPremiums.locationKey, earned: sql<number>`sum(${S.factPremiums.earnedPremium})::float` }).from(S.factPremiums).groupBy(S.factPremiums.locationKey);
  const premByKey = new Map(countyPrem.map((c) => [c.key, c.earned]));
  const locKeyByCode = new Map(COUNTIES.map((c, i) => [c.code, 1000 + i + 1] as const));
  const counties = countyRows.map((c) => {
    const ref = COUNTIES.find((x) => x.code === c.code);
    const earned = premByKey.get(locKeyByCode.get(c.code) ?? 0) ?? 0;
    return {
      code: c.code,
      name: c.name,
      riskZone: c.riskZone,
      lat: c.lat,
      lng: c.lng,
      claims: c.claims,
      incurred: Math.round(c.incurred),
      earnedPremium: Math.round(earned),
      lossRatio: earned > 0 ? Number(((c.incurred / earned) * 100).toFixed(1)) : 0,
      fraudScore: Number((c.fraud * 100).toFixed(1)),
      gx: ref?.gx ?? 0,
      gy: ref?.gy ?? 0,
      population: ref?.population ?? 0,
    };
  });

  const paymentChannels = await db.select({ channel: S.factPayments.channel, amount: sql<number>`sum(${S.factPayments.amount})::float`, n: sql<number>`count(*)::int` }).from(S.factPayments).groupBy(S.factPayments.channel).orderBy(desc(sql`sum(${S.factPayments.amount})`));

  const [custAgg] = await db
    .select({
      customers: sql<number>`count(*)::int`,
      duplicates: sql<number>`sum(case when ${S.silverCustomer.resolvedDuplicateOf} is not null then 1 else 0 end)::int`,
      kyc: sql<number>`sum(case when ${S.silverCustomer.kycStatus} = 'Verified' then 1 else 0 end)::int`,
    })
    .from(S.silverCustomer);

  const [polAgg] = await db
    .select({
      active: sql<number>`sum(case when ${S.silverPolicy.status} = 'Active' then 1 else 0 end)::int`,
      lapsed: sql<number>`sum(case when ${S.silverPolicy.status} = 'Lapsed' then 1 else 0 end)::int`,
      cancelled: sql<number>`sum(case when ${S.silverPolicy.status} = 'Cancelled' then 1 else 0 end)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(S.silverPolicy);

  const [dq] = await db.select({ score: sql<number>`avg(${S.dqCheck.score})::float`, checks: sql<number>`count(*)::int`, failed: sql<number>`sum(case when ${S.dqCheck.status} = 'failed' then 1 else 0 end)::int` }).from(S.dqCheck);

  const topFraud = await db
    .select({ alertId: S.factFraudEvents.alertId, claimId: S.factFraudEvents.claimId, score: S.factFraudEvents.fraudScore, level: S.factFraudEvents.riskLevel, amount: S.factFraudEvents.amountAtRisk, status: S.factFraudEvents.status, county: S.dimLocation.countyName })
    .from(S.factFraudEvents)
    .leftJoin(S.dimLocation, eq(S.dimLocation.locationKey, S.factFraudEvents.locationKey))
    .orderBy(desc(S.factFraudEvents.fraudScore))
    .limit(8);

  const retention = polAgg && polAgg.total > 0 ? ((polAgg.total - polAgg.cancelled - polAgg.lapsed) / polAgg.total) * 100 : 0;

  return {
    kpis: {
      earnedPremium: Math.round(gwp),
      incurredClaims: Math.round(incurred),
      lossRatio: gwp > 0 ? Number(((incurred / gwp) * 100).toFixed(1)) : 0,
      fraudExposure: Math.round(fraudExposure),
      fraudRate: incurred > 0 ? Number(((fraudExposure / incurred) * 100).toFixed(2)) : 0,
      ibnr: Math.round(ibnr?.ibnr ?? 0),
      ibnrBf: Math.round(bfRow?.ibnr ?? 0),
      ibnrCapeCod: Math.round(ccRow?.ibnr ?? 0),
      mackSe: Math.round(ibnr?.se ?? 0),
      claimCount,
      openClaims: totals?.openClaims ?? 0,
      reserves: Math.round(totals?.reserves ?? 0),
      fraudConfirmed: totals?.fraudConfirmed ?? 0,
      avgFraudScore: Number(((totals?.avgScore ?? 0) * 100).toFixed(1)),
      retention: Number(retention.toFixed(1)),
      churn: Number((100 - retention).toFixed(1)),
      customers: custAgg?.customers ?? 0,
      duplicateCustomers: custAgg?.duplicates ?? 0,
      kycVerified: custAgg && custAgg.customers ? Number(((custAgg.kyc / custAgg.customers) * 100).toFixed(1)) : 0,
      policiesActive: polAgg?.active ?? 0,
      policiesLapsed: polAgg?.lapsed ?? 0,
      dqScore: Number((dq?.score ?? 0).toFixed(1)),
      dqChecks: dq?.checks ?? 0,
      dqFailed: dq?.failed ?? 0,
    },
    trend,
    lob: lobRows.map((l) => ({ lob: l.lob, claims: l.claims, incurred: Math.round(l.incurred), earnedPremium: Math.round(premByLob.get(l.lob) ?? 0), avgFraudScore: Number((l.fraud * 100).toFixed(1)), lossRatio: (premByLob.get(l.lob) ?? 0) > 0 ? Number(((l.incurred / (premByLob.get(l.lob) ?? 1)) * 100).toFixed(1)) : 0 })),
    fraudLevels: fraudLevels.map((f) => ({ level: f.level, count: f.n, amount: Math.round(f.amount) })),
    counties,
    paymentChannels: paymentChannels.map((p) => ({ channel: p.channel, amount: Math.round(p.amount), count: p.n })),
    topFraud,
  };
}

/* ------------------------------------------------------------------ *
 * Streaming / pipelines
 * ------------------------------------------------------------------ */

export async function streamingData() {
  const metrics = await db.select().from(S.streamMetric).orderBy(S.streamMetric.ts);
  const byTopic = new Map<string, typeof metrics>();
  for (const m of metrics) {
    const arr = byTopic.get(m.topic) ?? [];
    arr.push(m);
    byTopic.set(m.topic, arr);
  }
  const bronzeByTopic = await db.select({ topic: S.bronzeEvent.topic, n: sql<number>`count(*)::int`, mode: sql<string>`max(${S.bronzeEvent.ingestMode})`, bytes: sql<number>`sum(${S.bronzeEvent.payloadBytes})::bigint`, last: sql<string>`max(${S.bronzeEvent.eventTime})` }).from(S.bronzeEvent).groupBy(S.bronzeEvent.topic);
  return {
    series: [...byTopic.entries()].map(([topic, rows]) => ({
      topic,
      points: rows.map((r) => ({ t: r.ts.toISOString().slice(11, 16), eps: r.eventsPerSec, lag: r.lag, p95: r.p95LatencyMs })),
      latest: rows[rows.length - 1],
    })),
    bronzeByTopic,
  };
}

export async function pipelineData() {
  const runs = await db.select().from(S.pipelineRun).orderBy(desc(S.pipelineRun.startedAt)).limit(120);
  const byDag = new Map<string, { runs: number; success: number; failed: number; avgMs: number; records: number; last: Date; engine: string; mode: string; layer: string }>();
  for (const r of runs) {
    const a = byDag.get(r.dagId) ?? { runs: 0, success: 0, failed: 0, avgMs: 0, records: 0, last: r.startedAt, engine: r.engine, mode: r.mode, layer: r.layer };
    a.runs += 1;
    a.avgMs += r.durationMs;
    a.records += r.recordsIn;
    if (r.status === "success") a.success += 1;
    if (r.status === "failed") a.failed += 1;
    byDag.set(r.dagId, a);
  }
  return {
    runs: runs.slice(0, 40),
    dags: [...byDag.entries()].map(([dag, v]) => ({ dag, ...v, avgMs: Math.round(v.avgMs / Math.max(1, v.runs)) })),
  };
}

/* ------------------------------------------------------------------ *
 * Lakehouse explorer
 * ------------------------------------------------------------------ */

export async function lakehouseData() {
  const catalog = await db.select().from(S.catalogEntry);
  const schemas = await db.select().from(S.schemaVersion);
  const bronzeTopicCounts = await db.select({ topic: S.bronzeEvent.topic, v1: sql<number>`sum(case when ${S.bronzeEvent.schemaVersion}=1 then 1 else 0 end)::int`, v2: sql<number>`sum(case when ${S.bronzeEvent.schemaVersion}=2 then 1 else 0 end)::int`, v3: sql<number>`sum(case when ${S.bronzeEvent.schemaVersion}>=3 then 1 else 0 end)::int`, n: sql<number>`count(*)::int` }).from(S.bronzeEvent).groupBy(S.bronzeEvent.topic);
  return { catalog, schemas, bronzeTopicCounts };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sampleRows(table: any, limit = 25) {
  const rows = await db.select().from(table).limit(limit);
  return rows as Array<Record<string, unknown>>;
}

export async function bronzeSample(topic: string, limit = 30) {
  const rows = await db.select().from(S.bronzeEvent).where(eq(S.bronzeEvent.topic, topic)).orderBy(desc(S.bronzeEvent.eventTime)).limit(limit);
  return rows;
}

/* ------------------------------------------------------------------ *
 * Actuarial
 * ------------------------------------------------------------------ */

export async function actuarialData() {
  const triangles = await db.select().from(S.devTriangle);
  const reserves = await db.select().from(S.reserveResult);
  const pricing = await db.select().from(S.pricingSegment);
  const premiumByQuarter = await db.select({ ym: S.factPremiums.yearMonth, earned: sql<number>`sum(${S.factPremiums.earnedPremium})::float` }).from(S.factPremiums).groupBy(S.factPremiums.yearMonth);
  const byLob = new Map<string, typeof triangles>();
  for (const t of triangles) {
    const arr = byLob.get(t.lob) ?? [];
    arr.push(t);
    byLob.set(t.lob, arr);
  }
  return { triangles: byLob, reserves, pricing, premiumByQuarter };
}

/* ------------------------------------------------------------------ *
 * Fraud
 * ------------------------------------------------------------------ */

export async function fraudData() {
  const alerts = await db
    .select({
      alertId: S.factFraudEvents.alertId,
      claimId: S.factFraudEvents.claimId,
      claimKey: S.factFraudEvents.claimKey,
      score: S.factFraudEvents.fraudScore,
      level: S.factFraudEvents.riskLevel,
      amount: S.factFraudEvents.amountAtRisk,
      status: S.factFraudEvents.status,
      assignedTo: S.factFraudEvents.assignedTo,
      detectedAt: S.factFraudEvents.detectedAt,
      modelId: S.factFraudEvents.modelId,
      reasons: S.factFraudEvents.reasons,
      features: S.factFraudEvents.features,
      networkLinks: S.factFraudEvents.networkLinks,
      latencyMs: S.factFraudEvents.latencyMs,
      detectionMode: S.factFraudEvents.detectionMode,
      county: S.dimLocation.countyName,
      locationKey: S.factFraudEvents.locationKey,
    })
    .from(S.factFraudEvents)
    .leftJoin(S.dimLocation, eq(S.dimLocation.locationKey, S.factFraudEvents.locationKey))
    .orderBy(desc(S.factFraudEvents.fraudScore))
    .limit(250);
  const providers = await db.select().from(S.silverProvider).orderBy(desc(S.silverProvider.providerRiskScore)).limit(12);
  const levels = await db.select({ level: S.factFraudEvents.riskLevel, n: sql<number>`count(*)::int`, amount: sql<number>`sum(${S.factFraudEvents.amountAtRisk})::float` }).from(S.factFraudEvents).groupBy(S.factFraudEvents.riskLevel);
  const statuses = await db.select({ status: S.factFraudEvents.status, n: sql<number>`count(*)::int` }).from(S.factFraudEvents).groupBy(S.factFraudEvents.status);
  const model = await db.select().from(S.modelRegistry).where(eq(S.modelRegistry.modelId, "fraud-ensemble-v3")).limit(1);
  const scoreDist = await db.select({ bucket: sql<string>`case when ${S.factClaims.fraudScore} < 0.2 then '0-20' when ${S.factClaims.fraudScore} < 0.4 then '20-40' when ${S.factClaims.fraudScore} < 0.6 then '40-60' when ${S.factClaims.fraudScore} < 0.8 then '60-80' else '80-100' end`, n: sql<number>`count(*)::int`, amount: sql<number>`sum(${S.factClaims.amountClaimed})::float` }).from(S.factClaims).groupBy(sql`1`);
  const causeFraud = await db.select({ cause: S.factClaims.cause, n: sql<number>`count(*)::int`, avgScore: sql<number>`avg(${S.factClaims.fraudScore})::float`, amount: sql<number>`sum(${S.factClaims.amountClaimed})::float` }).from(S.factClaims).groupBy(S.factClaims.cause).orderBy(desc(sql`avg(${S.factClaims.fraudScore})`)).limit(10);
  return { alerts, providers, levels, statuses, model: model[0], scoreDist, causeFraud };
}

/* ------------------------------------------------------------------ *
 * Governance
 * ------------------------------------------------------------------ */

export async function governanceData() {
  const checks = await db.select().from(S.dqCheck).orderBy(S.dqCheck.score);
  const lineage = await db.select().from(S.lineageEdge);
  const scd = await db.select().from(S.scdHistory).orderBy(desc(S.scdHistory.changedAt)).limit(60);
  const catalog = await db.select().from(S.catalogEntry);
  const [agg] = await db.select({ score: sql<number>`avg(${S.dqCheck.score})::float`, tested: sql<number>`sum(${S.dqCheck.recordsTested})::bigint`, failed: sql<number>`sum(${S.dqCheck.recordsFailed})::bigint`, checks: sql<number>`count(*)::int` }).from(S.dqCheck);
  const byDim = await db.select({ dim: S.dqCheck.dimension, score: sql<number>`avg(${S.dqCheck.score})::float`, n: sql<number>`count(*)::int`, failed: sql<number>`sum(${S.dqCheck.recordsFailed})::bigint` }).from(S.dqCheck).groupBy(S.dqCheck.dimension);
  const byDataset = await db.select({ dataset: S.dqCheck.dataset, layer: S.dqCheck.layer, score: sql<number>`avg(${S.dqCheck.score})::float` }).from(S.dqCheck).groupBy(S.dqCheck.dataset, S.dqCheck.layer).orderBy(S.dqCheck.dataset);
  return { checks, lineage, scd, catalog, agg: { score: Number((agg?.score ?? 0).toFixed(2)), tested: Number(agg?.tested ?? 0), failed: Number(agg?.failed ?? 0), checks: agg?.checks ?? 0 }, byDim, byDataset };
}

export async function modelsData() {
  const models = await db.select().from(S.modelRegistry);
  return { models };
}

export async function recentClaims(limit = 40) {
  return db
    .select({
      claimId: S.silverClaim.claimId,
      policyId: S.silverClaim.policyId,
      customerId: S.silverClaim.customerId,
      claimDate: S.silverClaim.claimDate,
      claimType: S.silverClaim.claimType,
      amount: S.silverClaim.amountClaimed,
      status: S.silverClaim.status,
      county: S.silverClaim.countyName,
      fraudScore: S.factClaims.fraudScore,
      riskLevel: S.factClaims.riskLevel,
      cause: S.silverClaim.cause,
    })
    .from(S.silverClaim)
    .leftJoin(S.factClaims, eq(S.factClaims.claimKey, S.silverClaim.claimKey))
    .orderBy(desc(S.silverClaim.claimDate))
    .limit(limit);
}

export async function churnLeaders(limit = 15) {
  const model = await db.select().from(S.modelRegistry).where(eq(S.modelRegistry.modelId, "churn-propensity-logit")).limit(1);
  const params = model[0]?.params as unknown as { weights: number[]; bias: number; means: number[]; stds: number[] } | undefined;
  if (!params) return [];
  const customers = await db
    .select({
      customerId: S.silverCustomer.customerId,
      name: S.silverCustomer.fullName,
      county: S.silverCustomer.countyName,
      channel: S.silverCustomer.channel,
      kyc: S.silverCustomer.kycStatus,
      premium: sql<number>`coalesce(sum(${S.silverPolicy.annualPremium}),0)::float`,
      policies: sql<number>`count(${S.silverPolicy.policyKey})::int`,
      lapsed: sql<number>`sum(case when ${S.silverPolicy.status} in ('Lapsed','Cancelled') then 1 else 0 end)::int`,
    })
    .from(S.silverCustomer)
    .leftJoin(S.silverPolicy, eq(S.silverPolicy.customerId, S.silverCustomer.customerId))
    .groupBy(S.silverCustomer.customerId, S.silverCustomer.fullName, S.silverCustomer.countyName, S.silverCustomer.channel, S.silverCustomer.kycStatus)
    .limit(4000);
  const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  const scored = customers.map((c) => {
    const x = [Math.max(0, (Date.now() - Date.parse("2024-01-01")) / (30.4 * 86400000)) * 0.6, c.policies, 0, 0, 120, c.premium / 120000, c.kyc === "Verified" ? 1 : 0, 0.45, 0.5];
    let z = params.bias;
    for (let j = 0; j < x.length; j++) z += params.weights[j] * ((x[j] - params.means[j]) / params.stds[j]);
    return { customerId: c.customerId, name: c.name, county: c.county, channel: c.channel, premium: Math.round(c.premium), policies: c.policies, lapsed: c.lapsed, churnScore: Number((sigmoid(z) * 100).toFixed(1)) };
  });
  scored.sort((a, b) => b.churnScore - a.churnScore || b.lapsed - a.lapsed);
  return scored.slice(0, limit);
}

export async function openFraudQueue(limit = 20) {
  return db
    .select({
      alertId: S.factFraudEvents.alertId,
      claimId: S.factFraudEvents.claimId,
      score: S.factFraudEvents.fraudScore,
      level: S.factFraudEvents.riskLevel,
      amount: S.factFraudEvents.amountAtRisk,
      status: S.factFraudEvents.status,
      assignedTo: S.factFraudEvents.assignedTo,
      detectedAt: S.factFraudEvents.detectedAt,
    })
    .from(S.factFraudEvents)
    .where(and(gte(S.factFraudEvents.fraudScore, 0.65)))
    .orderBy(desc(S.factFraudEvents.fraudScore))
    .limit(limit);
}
