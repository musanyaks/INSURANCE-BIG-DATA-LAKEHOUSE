/**
 * INSURELAKE bootstrap / seed orchestrator.
 *
 * Simulates the full Airflow + Spark + dbt pipeline end-to-end:
 *   sources → Kafka topics → Bronze (raw JSON) → Silver (cleansed/conformed)
 *   → ML feature store & model training → Gold marts → actuarial reserving
 *   → governance artefacts (DQ, lineage, catalog, SCD, schema evolution).
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as S from "@/db/schema";
import { COUNTIES, KAFKA_TOPICS, LOBS } from "./kenya";
import {
  agentRows,
  mergeQuality,
  providerRows,
  quarterOf,
  silverClaims,
  silverCustomers,
  silverPayments,
  silverPolicies,
  silverTelematics,
  vehicleRows,
  yearMonthOf,
  type Quality,
} from "./pipeline";
import {
  bornhuetterFerguson,
  buildTriangle,
  capeCod,
  chainLadder,
  ldf,
  mackTotal,
  pricingSegments,
  quarterList,
  type ReserveRow,
} from "./actuarial";
import {
  FRAUD_FEATURE_NAMES,
  SUSPICIOUS_DIRECTION,
  buildFraudFeatures,
  featureBounds,
  isolationScore,
  predict,
  riskLevel,
  trainLogistic,
  type FraudCtx,
  type LogisticModel,
} from "./ml";
import { generateUniverse, type BronzeRow, type SrcClaim, type Universe } from "./sim";

export type SeedProgress = {
  running: boolean;
  done: boolean;
  stage: string;
  pct: number;
  message: string;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  stats: Record<string, number | string> | null;
};

let progress: SeedProgress = {
  running: false,
  done: false,
  stage: "idle",
  pct: 0,
  message: "Lakehouse not provisioned",
  startedAt: null,
  finishedAt: null,
  error: null,
  stats: null,
};
let inflight: Promise<void> | null = null;

export function getProgress(): SeedProgress {
  return progress;
}

const ALL_TABLES: string[] = [
  "fact_vehicle_events", "fact_fraud_events", "fact_payments", "fact_premiums", "fact_claims",
  "pricing_segment", "reserve_result", "dev_triangle",
  "dim_location", "dim_date",
  "silver_telematics", "silver_agent", "silver_provider", "silver_vehicle", "silver_payment",
  "silver_claim", "silver_policy", "silver_customer", "bronze_event",
  "stream_metric", "model_registry", "scd_history", "schema_version", "catalog_entry",
  "lineage_edge", "dq_check", "pipeline_run", "platform_state",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bulk(table: any, rows: any[], size = 1200) {
  for (let i = 0; i < rows.length; i += size) {
    try {
      await db.insert(table).values(rows.slice(i, i + size)).onConflictDoNothing();
    } catch (e) {
      const cause = (e as { cause?: { message?: string } })?.cause?.message ?? (e as Error).message;
      const name = String(table?.config?.name ?? "table");
      throw new Error(`bulk insert into ${name} failed: ${String(cause).slice(0, 300)}`);
    }
  }
  return rows.length;
}

function set(stage: string, pct: number, message: string) {
  progress = { ...progress, stage, pct, message };
}

export async function isSeeded(): Promise<boolean> {
  try {
    const rows = await db.select().from(S.platformState).where(sql`${S.platformState.key} = 'bootstrap'`);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export function startSeed(force = false): { started: boolean; progress: SeedProgress } {
  if (inflight) return { started: false, progress };
  if (progress.done && !force) return { started: false, progress };
  inflight = runSeed(force)
    .catch((e: unknown) => {
      const cause = (e as { cause?: { message?: string } })?.cause?.message;
      const msg = e instanceof Error ? `${e.message}${cause ? ` :: ${cause}` : ""}` : String(e);
      progress = { ...progress, running: false, error: msg.slice(0, 600), message: "Bootstrap failed" };
    })
    .finally(() => {
      inflight = null;
    });
  return { started: true, progress };
}

export async function runSeed(force = false): Promise<void> {
  if (!force && progress.done) return;
  progress = { running: true, done: false, stage: "provision", pct: 2, message: "Provisioning lakehouse tables", startedAt: Date.now(), finishedAt: null, error: null, stats: null };
  const t0 = Date.now();

  set("provision", 3, "Truncating bronze/silver/gold partitions");
  await db.execute(sql.raw(`TRUNCATE TABLE ${ALL_TABLES.join(", ")} RESTART IDENTITY CASCADE`));

  set("generate", 8, "Simulating Kenyan insurance source systems (36 months)");
  const u = generateUniverse(20260929);

  set("ingest", 18, `Ingesting ${u.bronze.length.toLocaleString()} raw events into Bronze (S3/MinIO + Iceberg)`);
  const bronzeRows = u.bronze.map((b: BronzeRow) => ({
    eventId: b.eventId,
    topic: b.topic,
    sourceSystem: b.sourceSystem,
    schemaVersion: b.schemaVersion,
    payload: b.payload,
    eventTime: new Date(b.eventTime.replace(" ", "T") + "Z"),
    ingestTime: new Date(b.eventTime.replace(" ", "T") + "Z"),
    lakePath: b.lakePath,
    partition: b.partition,
    batchId: b.batchId,
    offset: b.offset,
    ingestMode: b.ingestMode,
    payloadBytes: b.payloadBytes,
  }));
  await bulk(S.bronzeEvent, bronzeRows, 2500);
  set("ingest", 34, "Bronze landing complete — starting Spark silver jobs");

  /* ---------------- SILVER ---------------- */
  const custRes = silverCustomers(u.bronze, u.asOf);
  const policyRes = silverPolicies(u.bronze, u.agents);
  const policyIds = new Set(policyRes.rows.map((p) => p.policyId));
  const customerIds = new Set(custRes.rows.map((c) => c.customerId));
  const claimRes = silverClaims(u.bronze, policyIds, customerIds, u.asOf);
  const payRes = silverPayments(u.bronze, policyIds);
  const telRes = silverTelematics(u.telematics);
  const provRows = providerRows(u.providers);
  const agtRows = agentRows(u.agents);
  const vehRows = vehicleRows(u.vehicles);

  set("silver", 44, `Cleaning ${claimRes.rows.length.toLocaleString()} claims, ${payRes.rows.length.toLocaleString()} payments`);
  await bulk(S.silverCustomer, custRes.rows);
  await bulk(S.silverPolicy, policyRes.rows);
  await bulk(S.silverClaim, claimRes.rows);
  await bulk(S.silverPayment, payRes.rows);
  await bulk(S.silverTelematics, telRes.rows);
  await bulk(S.silverProvider, provRows);
  await bulk(S.silverAgent, agtRows);
  await bulk(S.silverVehicle, vehRows);

  const quality = mergeQuality([custRes.q, policyRes.q, claimRes.q, payRes.q, telRes.q]);

  /* ---------------- GOLD DIMENSIONS ---------------- */
  set("gold", 50, "Building conformed dimensions (SCD2 date & location)");
  const dimDates: Array<typeof S.dimDate.$inferInsert> = [];
  for (let d = new Date(Date.UTC(u.start.getUTCFullYear(), u.start.getUTCMonth(), u.start.getUTCDate())); d <= u.asOf; d = new Date(d.getTime() + 86400000)) {
    const m = d.getUTCMonth() + 1;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dow = d.getUTCDay();
    const holidays = new Set(["01-01", "05-01", "06-01", "10-20", "12-12", "12-25", "12-26"]);
    const mmdd = `${String(m).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    dimDates.push({
      dateKey: d.getUTCFullYear() * 10000 + m * 100 + d.getUTCDate(),
      date: d.toISOString().slice(0, 10),
      year: d.getUTCFullYear(),
      quarter: Math.floor((m - 1) / 3) + 1,
      month: m,
      monthName: monthNames[m - 1],
      yearMonth: `${d.getUTCFullYear()}-${String(m).padStart(2, "0")}`,
      yearQuarter: `${d.getUTCFullYear()}Q${Math.floor((m - 1) / 3) + 1}`,
      dayOfWeek: dow,
      isWeekend: dow === 0 || dow === 6,
      rainSeason: m >= 3 && m <= 5 ? "Long rains" : m >= 10 && m <= 12 ? "Short rains" : m >= 6 && m <= 9 ? "Dry season" : "Hot dry",
      isHoliday: holidays.has(mmdd),
    });
  }
  const dimLocs = COUNTIES.map((c, i) => ({
    locationKey: 1000 + i + 1,
    countyCode: c.code,
    countyName: c.name,
    region: c.region,
    subCounty: c.subCounties[0],
    latitude: c.lat,
    longitude: c.lng,
    urbanRural: c.urbanRural,
    riskZone: c.riskZone,
    population: c.population,
    roadRiskIndex: c.roadRisk,
    floodRiskIndex: c.floodRisk,
    crimeRiskIndex: c.crimeRisk,
    rainfallMm: c.rainfallMm,
    gdpIndex: c.gdpIndex,
    mobilePenetration: c.mobilePenetration,
  }));
  const locKey = new Map(COUNTIES.map((c, i) => [c.code, 1000 + i + 1]));
  await bulk(S.dimDate, dimDates, 2000);
  await bulk(S.dimLocation, dimLocs);

  /* ---------------- ML FEATURE STORE + TRAINING ---------------- */
  set("ml", 56, "Materialising fraud feature store (Spark) & training models");
  const ctx = buildFraudContext(u, claimRes.rows, policyRes.rows, custRes.rows, vehRows, payRes.rows, telRes.rows, provRows);

  const sourceClaimById = new Map<string, SrcClaim>(u.claims.map((c) => [c.claimId, c]));
  const X: number[][] = [];
  const y: number[] = [];
  for (const c of claimRes.rows) {
    X.push(buildFraudFeatures(c, ctx));
    y.push(sourceClaimById.get(c.claimId)?.isFraud ? 1 : 0);
  }
  const bounds = featureBounds(X);
  const iso = X.map((x) => isolationScore(x, bounds, SUSPICIOUS_DIRECTION));
  const glm = trainLogistic(X, y, [...FRAUD_FEATURE_NAMES], { epochs: 200, lr: 0.09, l2: 0.006 });
  const isoModel = trainLogistic(iso.map((v) => [v]), y, ["isolation_percentile"], { epochs: 120, lr: 0.2, l2: 0.001 });
  const blended = X.map((x, i) => 0.84 * predict(glm, x) + 0.16 * iso[i]);
  const ensAuc = aucOf(blended, y);

  // churn model
  const churn = buildChurnDataset(u, policyRes.rows, payRes.rows, claimRes.rows);
  const churnModel = trainLogistic(churn.X, churn.y, churn.features, { epochs: 180, lr: 0.1, l2: 0.005 });

  /* ---------------- GOLD FACTS ---------------- */
  set("gold", 64, "Loading fact_claims / fact_premiums / fact_payments marts");
  const custById = new Map(custRes.rows.map((c) => [c.customerId, c]));
  const polById = new Map(policyRes.rows.map((p) => [p.policyId, p]));
  const vehByReg = new Map(vehRows.map((v) => [v.registration, v]));
  const provById = new Map(provRows.map((p) => [p.providerId, p]));

  const scored = claimRes.rows.map((c, i) => {
    const score = Math.min(0.995, Math.max(0.002, 0.84 * predict(glm, X[i]) + 0.16 * iso[i]));
    return { claim: c, score, level: riskLevel(score), features: X[i] };
  });
  for (const s of scored) {
    const truth = sourceClaimById.get(s.claim.claimId)?.isFraud ?? false;
    if (truth) s.claim.isFraud = true;
  }

  const factClaims = scored.map((s) => {
    const pol = polById.get(s.claim.policyId);
    const cust = custById.get(s.claim.customerId);
    const dk = dateKey(s.claim.claimDate);
    return {
      claimKey: s.claim.claimKey,
      claimId: s.claim.claimId,
      dateKey: dk,
      reportDateKey: dateKey(s.claim.reportDate),
      policyKey: `POLK-${s.claim.policyId.replace("POL-", "")}`,
      customerKey: `CUSK-${s.claim.customerId.replace("CUS-", "")}`,
      vehicleKey: s.claim.vehicleReg ? `VEHK-${s.claim.vehicleReg}` : null,
      agentKey: `AGTK-${(s.claim.agentId ?? "AGT-000").replace("AGT-", "")}`,
      providerKey: s.claim.providerId ? `PRVK-${s.claim.providerId.replace("PRV-", "")}` : null,
      locationKey: locKey.get(s.claim.countyCode) ?? 1047,
      claimType: s.claim.claimType,
      lob: pol?.lob ?? s.claim.claimType,
      cause: s.claim.cause,
      status: s.claim.status,
      amountClaimed: s.claim.amountClaimed,
      amountPaid: s.claim.amountPaid,
      reserveAmount: s.claim.reserveAmount,
      ultimateAmount: s.claim.amountPaid + s.claim.reserveAmount,
      fraudScore: Number(s.score.toFixed(4)),
      riskLevel: s.level,
      isFraud: s.claim.isFraud,
      isDuplicate: s.claim.isDuplicate,
      reportingLagDays: s.claim.reportingLagDays,
      yearMonth: yearMonthOf(s.claim.claimDate),
      originQuarter: quarterOf(s.claim.claimDate),
    };
  });
  await bulk(S.factClaims, factClaims, 2000);

  // premium snapshot fact: yearMonth × LOB × county
  type PremAgg = { written: number; earned: number; commission: number; inForce: number; newBusiness: number; renewals: number; cancellations: number; topAgent: string; agentPremium: Map<string, number> };
  const prem = new Map<string, PremAgg>();
  const months = [...new Set(dimDates.map((d) => d.yearMonth))].sort();
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  for (const p of policyRes.rows) {
    const startM = yearMonthOf(p.startDate);
    const endM = yearMonthOf(p.endDate);
    const si = monthIdx.get(startM);
    if (si === undefined) continue;
    const ei = Math.min(months.length - 1, monthIdx.get(endM) ?? months.length - 1);
    const key0 = `${startM}|${p.lob}|${p.countyCode}`;
    const agg0 = prem.get(key0) ?? { written: 0, earned: 0, commission: 0, inForce: 0, newBusiness: 0, renewals: 0, cancellations: 0, topAgent: p.agentId, agentPremium: new Map<string, number>() };
    agg0.written += p.annualPremium;
    agg0.newBusiness += 1;
    agg0.commission += p.annualPremium * p.commissionRate;
    prem.set(key0, agg0);
    for (let i = si; i <= ei; i++) {
      const key = `${months[i]}|${p.lob}|${p.countyCode}`;
      const agg = prem.get(key) ?? { written: 0, earned: 0, commission: 0, inForce: 0, newBusiness: 0, renewals: 0, cancellations: 0, topAgent: p.agentId, agentPremium: new Map<string, number>() };
      agg.earned += p.annualPremium / 12;
      agg.inForce += 1;
      agg.agentPremium.set(p.agentId, (agg.agentPremium.get(p.agentId) ?? 0) + p.annualPremium / 12);
      prem.set(key, agg);
    }
  }
  const factPremiums = [...prem.entries()].map(([k, a], i) => {
    const [ym, lob, countyCode] = k.split("|");
    let topAgent = a.topAgent;
    let best = 0;
    for (const [ag, v] of a.agentPremium) if (v > best) { best = v; topAgent = ag; }
    return {
      id: `FPR-${String(i + 1).padStart(6, "0")}`,
      dateKey: dateKey(`${ym}-01`),
      policyKey: `SNAPSHOT-${lob}`,
      customerKey: "ALL",
      agentKey: `AGTK-${topAgent.replace("AGT-", "")}`,
      locationKey: locKey.get(countyCode) ?? 1047,
      lob,
      yearMonth: ym,
      writtenPremium: Math.round(a.written),
      earnedPremium: Math.round(a.earned),
      commission: Math.round(a.commission),
      policiesInForce: a.inForce,
      newBusiness: a.newBusiness,
      renewals: 0,
      cancellations: a.cancellations,
    };
  });
  await bulk(S.factPremiums, factPremiums, 2000);

  const custKeyById = new Map(custRes.rows.map((c) => [c.customerId, c.customerKey]));
  const polKeyById = new Map(policyRes.rows.map((p) => [p.policyId, p.policyKey]));
  const factPayments = payRes.rows.map((p) => ({
    paymentKey: `PAYK-${p.paymentId.replace("PAY-", "")}`,
    paymentId: p.paymentId,
    dateKey: dateKey(p.paidAt.toISOString().slice(0, 10)),
    policyKey: polKeyById.get(p.policyId) ?? "UNKNOWN",
    customerKey: custKeyById.get(p.customerId) ?? "UNKNOWN",
    locationKey: locKey.get(p.countyCode) ?? 1047,
    channel: p.channel,
    paymentType: p.paymentType,
    amount: p.amount,
    status: p.status,
    yearMonth: yearMonthOf(p.paidAt),
  }));
  await bulk(S.factPayments, factPayments, 2500);

  // telematics fact
  type TelAgg = { trips: number; distance: number; speedSum: number; harsh: number; night: number; customerId: string; countyCode: string };
  const telAgg = new Map<string, TelAgg>();
  for (const t of telRes.rows) {
    const ym = yearMonthOf(t.occurredAt);
    const key = `${ym}|${t.vehicleReg}`;
    const a = telAgg.get(key) ?? { trips: 0, distance: 0, speedSum: 0, harsh: 0, night: 0, customerId: t.customerId, countyCode: t.countyCode };
    a.trips += 1;
    a.distance += t.distanceKm;
    a.speedSum += t.speedKmh;
    a.harsh += t.harshBraking + t.harshAcceleration;
    a.night += t.nightDrivingKm;
    telAgg.set(key, a);
  }
  const factVehicle = [...telAgg.entries()].map(([k, a], i) => {
    const [ym, reg] = k.split("|");
    const driverScore = Math.max(12, Math.min(99, 96 - a.harsh * 2.4 - a.night * 0.06 - Math.max(0, a.speedSum / Math.max(1, a.trips) - 62) * 0.7));
    return {
      id: `FVE-${String(i + 1).padStart(6, "0")}`,
      dateKey: dateKey(`${ym}-01`),
      vehicleKey: `VEHK-${reg}`,
      customerKey: `CUSK-${a.customerId.replace("CUS-", "")}`,
      locationKey: locKey.get(a.countyCode) ?? 1047,
      yearMonth: ym,
      trips: a.trips,
      distanceKm: Number(a.distance.toFixed(1)),
      avgSpeedKmh: Number((a.speedSum / Math.max(1, a.trips)).toFixed(1)),
      harshEvents: a.harsh,
      nightKm: Number(a.night.toFixed(1)),
      driverScore: Number(driverScore.toFixed(1)),
    };
  });
  await bulk(S.factVehicleEvents, factVehicle, 2500);

  /* ---------------- FRAUD MART ---------------- */
  set("gold", 72, "Publishing fraud alerts to fact_fraud_events + Kafka fraud topic");
  const factClaimByKey = new Map(factClaims.map((f) => [f.claimKey, f]));
  const alerts = scored
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.score >= 0.35)
    .sort((a, b) => b.s.score - a.s.score)
    .slice(0, 900)
    .map(({ s, i }) => {
      const fc = factClaimByKey.get(s.claim.claimKey)!;
      const reasons = explainReasons(glm, s.features, iso[i] ?? 0);
      const ring = u.fraudRings.find((r) => r.claimIds.includes(s.claim.claimId));
      const links = [
        { from: s.claim.customerId, to: s.claim.providerId ?? "n/a", type: "claimant→provider", weight: 1 },
        ...(ring ? [{ from: ring.ringId, to: ring.providerId ?? "", type: "ring→provider", weight: ring.claimIds.length }] : []),
        ...(s.claim.vehicleReg ? [{ from: s.claim.vehicleReg, to: s.claim.customerId, type: "vehicle→owner", weight: 1 }] : []),
      ];
      return {
        alertId: `FRD-${String(s.claim.claimId.replace("CLM-", "")).padStart(6, "0")}`,
        claimKey: s.claim.claimKey,
        claimId: s.claim.claimId,
        customerKey: fc.customerKey,
        providerKey: fc.providerKey,
        locationKey: fc.locationKey,
        detectedAt: new Date(s.claim.ingestedAt.getTime() + 3400),
        fraudScore: Number(s.score.toFixed(4)),
        riskLevel: s.level,
        modelId: "fraud-ensemble-v3",
        reasons: reasons.reasons,
        features: Object.fromEntries(FRAUD_FEATURE_NAMES.map((n, i) => [n, Number((s.features[i] ?? 0).toFixed(4))])),
        amountAtRisk: s.claim.amountClaimed,
        status: s.score >= 0.78 ? "Investigation opened" : s.score >= 0.56 ? "Queued for review" : "Monitoring",
        assignedTo: s.score >= 0.56 ? ["SIU Nairobi", "SIU Mombasa", "SIU Kisumu", "SIU Nakuru"][Math.abs(hashCode(s.claim.claimId)) % 4] : null,
        detectionMode: s.claim.ingestedAt.getTime() > Date.now() - 7 * 86400000 ? "streaming" : "batch",
        latencyMs: 260 + (Math.abs(hashCode(s.claim.claimId)) % 900),
        networkLinks: links,
      };
    });
  await bulk(S.factFraudEvents, alerts, 500);

  /* ---------------- ACTUARIAL ---------------- */
  set("actuarial", 78, "Running chain ladder / Mack / BF / Cape Cod reserving");
  const quarters = quarterList(u.start, u.asOf, 14);
  const earnedByQuarter = new Map<string, number>();
  const earnedByQuarterLob = new Map<string, Map<string, number>>();
  for (const f of factPremiums) {
    const q = quarterOf(`${f.yearMonth}-01`);
    earnedByQuarter.set(q, (earnedByQuarter.get(q) ?? 0) + f.earnedPremium);
    const m = earnedByQuarterLob.get(f.lob) ?? new Map<string, number>();
    m.set(q, (m.get(q) ?? 0) + f.earnedPremium);
    earnedByQuarterLob.set(f.lob, m);
  }
  const devRows: Array<typeof S.devTriangle.$inferInsert> = [];
  const reserveRows: Array<typeof S.reserveResult.$inferInsert> = [];
  const lobList = ["Motor", "Health", "Life", "Micro", "Agriculture"];
  const triangleSummary: Record<string, { ibnr: number; ultimate: number; se: number; cv: number; ldf: number[] }> = {};

  const settleByClaim = new Map(claimRes.rows.map((c) => [c.claimKey, c] as const));
  const recentPartial = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  for (const lob of lobList) {
    const claimsForLob = factClaims.filter((f) => f.lob === lob);
    const paidInputs = claimsForLob.flatMap((f) => {
      if (f.amountPaid <= 0) return [];
      const src = settleByClaim.get(f.claimKey);
      const oi = quarters.indexOf(f.originQuarter);
      if (oi < 0) return [];
      let pi: number;
      if (src?.settleDate) {
        pi = quarters.indexOf(quarterOf(src.settleDate));
      } else {
        // open claim: partial payments land progressively through development
        const elapsed = Math.max(0, quarters.length - 1 - oi);
        pi = oi + (Math.abs(hashCode(f.claimId)) % (elapsed + 1));
      }
      if (pi < 0 || pi >= quarters.length) pi = quarters.length - 1;
      void recentPartial;
      return [{ origin: f.originQuarter, dev: pi - oi, amount: f.amountPaid }];
    });
    const incurredInputs = claimsForLob.flatMap((f) => {
      const oi = quarters.indexOf(f.originQuarter);
      const src = settleByClaim.get(f.claimKey);
      const pi = quarters.indexOf(quarterOf(src?.reportDate ?? f.originQuarter));
      if (oi < 0 || pi < 0) return [];
      return [{ origin: f.originQuarter, dev: Math.max(0, pi - oi), amount: f.amountPaid + f.reserveAmount }];
    });
    const paidTri = buildTriangle(quarters, paidInputs);
    const incTri = buildTriangle(quarters, incurredInputs);
    const cl = chainLadder(paidTri);
    const f = ldf(paidTri);
    const mack = mackTotal(paidTri, cl);
    const apriori = lob === "Motor" ? 0.68 : lob === "Health" ? 0.79 : lob === "Life" ? 0.52 : lob === "Micro" ? 0.61 : 0.72;
    const bf = bornhuetterFerguson(paidTri, earnedByQuarterLob.get(lob) ?? earnedByQuarter, apriori);
    const cc = capeCod(paidTri, earnedByQuarter);

    paidTri.origins.forEach((origin, i) => {
      for (let k = 0; k < paidTri.maxDev; k++) {
        const inc = paidTri.incremental[i][k];
        if (inc === null || paidTri.cumulative[i][k] === null) continue;
        devRows.push({
          id: `${lob}-paid-${origin}-${k}`,
          lob,
          measure: "paid",
          originPeriod: origin,
          devPeriod: k,
          incremental: Math.round(inc),
          cumulative: Math.round(paidTri.cumulative[i][k] ?? 0),
          ldf: k < f.length ? Number(f[k].toFixed(5)) : null,
        });
      }
      for (let k = 0; k < incTri.maxDev; k++) {
        const inc = incTri.incremental[i][k];
        if (inc === null || incTri.cumulative[i][k] === null) continue;
        devRows.push({
          id: `${lob}-incurred-${origin}-${k}`,
          lob,
          measure: "incurred",
          originPeriod: origin,
          devPeriod: k,
          incremental: Math.round(inc),
          cumulative: Math.round(incTri.cumulative[i][k] ?? 0),
          ldf: null,
        });
      }
    });

    cl.forEach((row, i) => {
      reserveRows.push(reserveRow(lob, "chain_ladder", row, mack.se / Math.max(1, cl.length)));
      reserveRows.push(reserveRow(lob, "bornhuetter_ferguson", bf[i]));
      reserveRows.push(reserveRow(lob, "cape_cod", cc[i]));
      reserveRows.push(reserveRow(lob, "mack", { ...row, mackStdError: row.mackStdError, coefficientOfVariation: row.coefficientOfVariation }, mack.se / Math.max(1, cl.length)));
    });
    triangleSummary[lob] = {
      ibnr: cl.reduce((s, r) => s + r.ibnr, 0),
      ultimate: cl.reduce((s, r) => s + r.ultimate, 0),
      se: mack.se,
      cv: mack.cv,
      ldf: f.slice(0, 8),
    };
  }
  await bulk(S.devTriangle, devRows, 2500);
  await bulk(S.reserveResult, reserveRows, 1500);

  /* ---------------- PRICING SEGMENTS ---------------- */
  set("actuarial", 84, "Fitting Tweedie pricing GLM — frequency × severity segments");
  const driverByCustomer = new Map<string, number>();
  for (const v of factVehicle) driverByCustomer.set(v.customerKey, Math.max(driverByCustomer.get(v.customerKey) ?? 0, v.driverScore));
  const priceRows: Array<typeof S.pricingSegment.$inferInsert> = [];
  for (const lob of lobList) {
    const pols = policyRes.rows.filter((p) => p.lob === lob);
    const claimsForLob = claimRes.rows.filter((c) => polById.get(c.policyId)?.lob === lob);
    const seg = new Map<string, { exposure: number; premium: number; claims: number; paid: number; driver: number }>();
    for (const p of pols) {
      const cust = custById.get(p.customerId);
      const a = countyOf(p.countyCode)?.riskZone ?? "Green";
      const b = cust?.ageBand ?? "26-35";
      const key = `${a}|${b}`;
      const s = seg.get(key) ?? { exposure: 0, premium: 0, claims: 0, paid: 0, driver: 0 };
      s.exposure += 1;
      s.premium += p.annualPremium;
      s.driver += driverByCustomer.get(`CUSK-${p.customerId.replace("CUS-", "")}`) ?? 74;
      seg.set(key, s);
    }
    for (const c of claimsForLob) {
      const cust = custById.get(c.customerId);
      const key = `${countyOf(c.countyCode)?.riskZone ?? "Green"}|${cust?.ageBand ?? "26-35"}`;
      const s = seg.get(key);
      if (!s) continue;
      s.claims += 1;
      s.paid += c.amountPaid;
    }
    const rows = pricingSegments({
      lob,
      segments: [...seg.entries()].map(([k, v]) => ({
        dimensionA: `${k.split("|")[0]} zone`,
        dimensionB: `Age ${k.split("|")[1]}`,
        exposure: v.exposure,
        premium: v.premium,
        claims: v.claims,
        paid: v.paid,
        driverScore: v.exposure ? v.driver / v.exposure : 74,
      })),
    });
    priceRows.push(...rows);
  }
  await bulk(S.pricingSegment, priceRows, 500);

  /* ---------------- GOVERNANCE ---------------- */
  set("governance", 88, "Running Great Expectations suite & publishing lineage/catalog");
  const dqRowsBuilt = dqRows(quality, u, claimRes.rows.length, payRes.rows.length);
  const dqComposite = dqRowsBuilt.length ? dqRowsBuilt.reduce((sum, c) => sum + c.score, 0) / dqRowsBuilt.length : 100;
  await bulk(S.dqCheck, dqRowsBuilt);
  await bulk(S.lineageEdge, lineageRows());
  await bulk(S.catalogEntry, catalogRows(u, {
    bronze: u.bronze.length,
    customers: custRes.rows.length,
    policies: policyRes.rows.length,
    claims: claimRes.rows.length,
    payments: payRes.rows.length,
    vehicles: vehRows.length,
    providers: provRows.length,
    agents: agtRows.length,
    telematics: telRes.rows.length,
    factClaims: factClaims.length,
    factPremiums: factPremiums.length,
    factPayments: factPayments.length,
    factFraud: alerts.length,
    factVehicle: factVehicle.length,
  }));
  await bulk(S.schemaVersion, schemaVersions());
  await bulk(S.scdHistory, u.scdEvents.map((e) => ({
    id: e.id,
    tableName: e.tableName,
    strategy: e.strategy,
    entityKey: e.entityKey,
    entityLabel: e.entityLabel,
    attribute: e.attribute,
    oldValue: e.oldValue,
    newValue: e.newValue,
    changedAt: new Date(e.changedAt.replace(" ", "T") + "Z"),
    changedBy: e.changedBy,
    validFrom: new Date(e.validFrom + "T00:00:00Z"),
    validTo: e.validTo ? new Date(e.validTo + "T00:00:00Z") : null,
  })));
  await bulk(S.pipelineRun, pipelineRuns(u));
  await bulk(S.streamMetric, streamMetrics(u));
  await bulk(S.modelRegistry, modelRows(glm, isoModel, ensAuc, churnModel, triangleSummary, X.length, iso, y, u, bounds));

  const totalIbnr = reserveRows.filter((r) => r.method === "chain_ladder").reduce((s, r) => s + r.ibnr, 0);
  const stats = {
    bronze_events: u.bronze.length,
    silver_rows: custRes.rows.length + policyRes.rows.length + claimRes.rows.length + payRes.rows.length + telRes.rows.length + vehRows.length + provRows.length + agtRows.length,
    gold_rows: factClaims.length + factPremiums.length + factPayments.length + factVehicle.length + alerts.length,
    claims: claimRes.rows.length,
    quarantined: claimRes.quarantined.length,
    dq_score: Number(dqComposite.toFixed(2)),
    fraud_alerts: alerts.length,
    ibnr: Math.round(totalIbnr),
    lake_size_mb: Math.round(u.bronze.reduce((s, b) => s + b.payloadBytes, 0) / 1024 / 1024),
    duration_s: Math.round((Date.now() - t0) / 1000),
  };
  await db.insert(S.platformState).values({ key: "bootstrap", value: { ...stats, seededAt: new Date().toISOString() } }).onConflictDoUpdate({ target: S.platformState.key, set: { value: { ...stats, seededAt: new Date().toISOString() }, updatedAt: new Date() } });

  progress = { running: false, done: true, stage: "complete", pct: 100, message: "Lakehouse provisioned", startedAt: progress.startedAt, finishedAt: Date.now(), error: null, stats };
}

/* ------------------------------------------------------------------ */

function reserveRow(lob: string, method: string, row: ReserveRow, fallbackSe?: number): typeof S.reserveResult.$inferInsert {
  return {
    id: `${lob}-${method}-${row.origin}`,
    lob,
    method,
    originPeriod: row.origin,
    paidToDate: Math.round(row.paidToDate),
    ultimate: Math.round(row.ultimate),
    ibnr: Math.round(row.ibnr),
    mackStdError: row.mackStdError !== null ? Math.round(row.mackStdError) : fallbackSe !== undefined ? Math.round(fallbackSe) : null,
    coefficientOfVariation: row.coefficientOfVariation !== null ? Number(row.coefficientOfVariation.toFixed(4)) : null,
    aprioriLossRatio: row.aprioriLossRatio !== null ? Number(row.aprioriLossRatio.toFixed(4)) : null,
    reserveAdequacy: row.reserveAdequacy !== null ? Number(row.reserveAdequacy.toFixed(4)) : null,
  };
}

function dateKey(d: string | Date): number {
  const dt = typeof d === "string" ? new Date(d.length <= 10 ? d + "T00:00:00Z" : d.replace(" ", "T") + "Z") : d;
  return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
}

function countyOf(code: string) {
  return COUNTIES.find((c) => c.code === code);
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function aucOf(scores: number[], labels: number[]): number {
  const pairs = scores.map((s, i) => [s, labels[i]] as const);
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  let pos = 0;
  let neg = 0;
  let rankSum = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i][1] === 1) {
      pos++;
      rankSum += i + 1;
    } else neg++;
  }
  if (!pos || !neg) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

function explainReasons(model: LogisticModel, x: number[], anomaly: number) {
  const contrib = x.map((v, j) => (model.weights[j] * (v - model.means[j])) / model.stds[j]);
  void anomaly;
  const meta = [
    { name: "claim_amount", label: "Claim amount", reason: (v: number) => `Claim of KSh ${Math.round(v).toLocaleString()} is materially above the segment median` },
    { name: "amount_z_segment", label: "Amount vs LOB×county baseline", reason: (v: number) => `Amount is ${v.toFixed(1)}σ above the historical average for this line and county` },
    { name: "amount_si_ratio", label: "Amount / sum insured", reason: (v: number) => `Claim consumes ${(v * 100).toFixed(0)}% of the sum insured` },
    { name: "days_since_policy_start", label: "Days since inception", reason: (v: number) => `Claim made ${Math.round(v)} days after policy inception` },
    { name: "customer_claim_count_365", label: "Customer claim frequency", reason: (v: number) => `${Math.round(v)} claims lodged by this customer in 12 months` },
    { name: "customer_claim_freq_ratio", label: "Frequency vs portfolio", reason: (v: number) => `Claim frequency ${v.toFixed(1)}× the portfolio mean` },
    { name: "vehicle_claim_count", label: "Vehicle claim history", reason: (v: number) => `Vehicle linked to ${Math.round(v)} claims across the book` },
    { name: "provider_claim_volume", label: "Provider concentration", reason: (v: number) => `Provider processed ${Math.round(v)} claims` },
    { name: "provider_risk_score", label: "Provider risk score", reason: (v: number) => `Provider risk score ${(v * 100).toFixed(0)}%` },
    { name: "provider_fraud_ratio", label: "Provider fraud ratio", reason: (v: number) => `${(v * 100).toFixed(1)}% of provider claims previously flagged` },
    { name: "provider_shared_customers", label: "Network connections", reason: (v: number) => `Provider shares ${Math.round(v)} customers with other flagged claims` },
    { name: "reporting_lag_days", label: "Reporting lag", reason: (v: number) => `Reported within ${Math.round(v)} day(s) — instant notification pattern` },
    { name: "location_risk", label: "County risk index", reason: (v: number) => `County risk index ${(v * 100).toFixed(0)}%` },
    { name: "payment_velocity", label: "Payment velocity", reason: (v: number) => `${Math.round(v)} premium transactions in the 30 days before the claim` },
    { name: "duplicate_score", label: "Duplicate documentation", reason: (v: number) => `Duplicate submission score ${(v * 100).toFixed(0)}%` },
    { name: "telematics_harsh", label: "Telematics consistency", reason: (v: number) => (v > 0.5 ? "No harsh-event recorded near the incident — inconsistent with declared cause" : "Telematics consistent with declared cause") },
    { name: "night_driving_ratio", label: "Night driving exposure", reason: (v: number) => `${(v * 100).toFixed(0)}% of trips between 22:00 and 05:00` },
    { name: "round_amount_flag", label: "Round amount", reason: (v: number) => (v > 0.5 ? "Exact round figure — typical of fabricated invoices" : "Amount pattern consistent with genuine invoices") },
    { name: "multi_claim_14d", label: "Clustered claims", reason: (v: number) => (v > 0 ? `${Math.round(v)} claims within a 14-day window` : "No clustered claims") },
  ];
  const reasons = meta
    .map((m, i) => ({ m, i, contribution: contrib[i] ?? 0 }))
    .filter((r) => r.contribution > 0.12)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 6)
    .map((r) => ({ feature: r.m.name, label: r.m.label, detail: r.m.reason(x[r.i]), contribution: Number(r.contribution.toFixed(4)), value: Number((x[r.i] ?? 0).toFixed(4)) }));
  return { reasons: reasons.length ? reasons : [{ feature: "baseline", label: "Baseline", detail: "No anomalous pattern detected", contribution: 0.01, value: 0 }] };
}

export function buildFraudContext(
  u: Universe,
  claims: Array<{ claimId: string; customerId: string; policyId: string; providerId: string | null; vehicleReg: string | null; claimDate: string; amountClaimed: number; claimType: string; countyCode: string; reportingLagDays: number; dedupeScore: number }>,
  policies: Array<{ policyId: string; startDate: string; sumInsured: number; lob: string }>,
  customers: Array<{ customerId: string }>,
  vehicles: Array<{ registration: string; customerId: string }>,
  payments: Array<{ customerId: string; paidAt: Date }>,
  telematics: Array<{ vehicleReg: string; harshBraking: number; harshAcceleration: number; nightDrivingKm: number; distanceKm: number; speedKmh: number }>,
  providers: Array<{ providerId: string; claimVolume: number; providerRiskScore: number; rejectionRate: number; networkDegree: number }>,
): FraudCtx {
  void customers;
  void vehicles;
  const fraudByClaim = new Map(u.claims.map((c) => [c.claimId, c.isFraud]));
  const customerClaims = new Map<string, { dates: string[]; amounts: number[]; ids: string[] }>();
  const vehicleClaims = new Map<string, number>();
  const providerCustomers = new Map<string, Set<string>>();
  const providerFraud = new Map<string, number>();
  for (const c of claims) {
    const cc = customerClaims.get(c.customerId) ?? { dates: [], amounts: [], ids: [] };
    cc.dates.push(c.claimDate);
    cc.amounts.push(c.amountClaimed);
    cc.ids.push(c.claimId);
    customerClaims.set(c.customerId, cc);
    if (c.vehicleReg) vehicleClaims.set(c.vehicleReg, (vehicleClaims.get(c.vehicleReg) ?? 0) + 1);
    if (c.providerId) {
      const set = providerCustomers.get(c.providerId) ?? new Set<string>();
      set.add(c.customerId);
      providerCustomers.set(c.providerId, set);
      if (fraudByClaim.get(c.claimId)) providerFraud.set(c.providerId, (providerFraud.get(c.providerId) ?? 0) + 1);
    }
  }
  const policyStart = new Map(policies.map((p) => [p.policyId, p.startDate]));
  const policySumInsured = new Map(policies.map((p) => [p.policyId, p.sumInsured]));
  const policyLob = new Map(policies.map((p) => [p.policyId, p.lob]));
  const providerStats = new Map(
    providers.map((p) => [
      p.providerId,
      {
        volume: p.claimVolume,
        risk: p.providerRiskScore,
        rejection: p.rejectionRate,
        fraudVolume: providerFraud.get(p.providerId) ?? 0,
        avgAmount: 0,
        degree: p.networkDegree,
      },
    ]),
  );
  const countyAcc = new Map<string, { sum: number; n: number; road: number; crime: number }>();
  const segAcc = new Map<string, { sum: number; sq: number; n: number }>();
  for (const c of claims) {
    const ref = COUNTIES.find((x) => x.code === c.countyCode);
    const ca = countyAcc.get(c.countyCode) ?? { sum: 0, n: 0, road: ref?.roadRisk ?? 0.5, crime: ref?.crimeRisk ?? 0.5 };
    ca.sum += c.amountClaimed;
    ca.n += 1;
    countyAcc.set(c.countyCode, ca);
    const key = `${c.claimType}|${c.countyCode}`;
    const sa = segAcc.get(key) ?? { sum: 0, sq: 0, n: 0 };
    sa.sum += c.amountClaimed;
    sa.sq += c.amountClaimed ** 2;
    sa.n += 1;
    segAcc.set(key, sa);
  }
  const countyStats = new Map(
    [...countyAcc.entries()].map(([k, v]) => [k, { roadRisk: v.road, crimeRisk: v.crime, avgAmount: v.sum / v.n, volume: v.n }]),
  );
  const lobCountyAvg = new Map(
    [...segAcc.entries()].map(([k, v]) => {
      const mean = v.sum / v.n;
      const varr = Math.max(1, v.sq / v.n - mean * mean);
      return [k, { avg: mean, sd: Math.sqrt(varr), n: v.n }];
    }),
  );
  const paymentVelocity = new Map<string, number>();
  const byCust = new Map<string, number[]>();
  for (const p of payments) {
    const arr = byCust.get(p.customerId) ?? [];
    arr.push(p.paidAt.getTime());
    byCust.set(p.customerId, arr);
  }
  for (const [custId, times] of byCust) {
    times.sort((a, b) => a - b);
    let best = 0;
    for (let i = 0; i < times.length; i++) {
      const window = times.filter((t) => t <= times[i] && t > times[i] - 30 * 86400000).length;
      best = Math.max(best, window);
    }
    paymentVelocity.set(custId, best);
  }
  const telAcc = new Map<string, { harsh: number; nightKm: number; speedSum: number; trips: number; distance: number }>();
  for (const t of telematics) {
    const a = telAcc.get(t.vehicleReg) ?? { harsh: 0, nightKm: 0, speedSum: 0, trips: 0, distance: 0 };
    a.harsh += t.harshBraking + t.harshAcceleration;
    a.nightKm += t.nightDrivingKm;
    a.speedSum += t.speedKmh;
    a.trips += 1;
    a.distance += t.distanceKm;
    telAcc.set(t.vehicleReg, a);
  }
  const telematicsMap = new Map(
    [...telAcc.entries()].map(([k, v]) => [
      k,
      {
        harsh: v.harsh,
        nightKm: v.nightKm,
        avgSpeed: v.speedSum / Math.max(1, v.trips),
        trips: v.trips,
        score: Math.max(10, Math.min(99, 96 - v.harsh * 0.8 - v.nightKm * 0.01)),
      },
    ]),
  );
  return { customerClaims, vehicleClaims, policyStart, policySumInsured, policyLob, providerStats, countyStats, lobCountyAvg, paymentVelocity, telematics: telematicsMap, providerCustomers };
}

export function overallDq(q: Quality): number {
  let tested = 0;
  let failed = 0;
  for (const v of Object.values(q.counters)) {
    tested += v.tested;
    failed += v.failed;
  }
  return tested ? ((tested - failed) / tested) * 100 : 100;
}

export function dqRows(q: Quality, u: Universe, claims: number, payments: number) {
  const dimensionFor = (k: string) =>
    k.includes("unique") || k.includes("dedupe") || k.includes("resolution")
      ? "Uniqueness"
      : k.includes("complete")
        ? "Completeness"
        : k.includes("valid")
          ? "Validity"
          : k.includes("timeli") || k.includes("late")
            ? "Timeliness"
            : k.includes("accuracy") || k.includes("lag")
              ? "Accuracy"
              : "Consistency";
  const rows: Array<typeof S.dqCheck.$inferInsert> = [];
  let i = 0;
  for (const [key, v] of Object.entries(q.counters)) {
    if (v.tested === 0) continue;
    const score = ((v.tested - v.failed) / v.tested) * 100;
    const dataset = key.split("_")[0];
    rows.push({
      id: `DQ-${String(++i).padStart(4, "0")}`,
      dataset: `silver_${dataset}`,
      layer: "silver",
      dimension: dimensionFor(key),
      expectation: `expect_${key}`,
      rule: key.replace(/_/g, " "),
      recordsTested: v.tested,
      recordsFailed: v.failed,
      score: Number(score.toFixed(2)),
      severity: score < 95 ? "critical" : score < 99 ? "warning" : "info",
      status: score < 95 ? "failed" : score < 99 ? "warning" : "passed",
      runAt: new Date(Date.now() - (i % 12) * 3600000),
    });
  }
  const kycUnverified = u.customers.filter((c) => c.kycStatus !== "Verified").length;
  const ntsaInvalid = u.vehicles.filter((v) => v.ntsaStatus !== "Inspection Valid").length;
  const lowBattery = u.telematics.filter((t) => t.batteryPct < 20).length;
  const lastPing = new Map<string, number>();
  for (const t of u.telematics) {
    const ts = Date.parse(t.occurredAt.replace(" ", "T") + "Z");
    lastPing.set(t.deviceId, Math.max(lastPing.get(t.deviceId) ?? 0, ts));
  }
  const trackedDevices = lastPing.size;
  const staleDevices = [...lastPing.values()].filter((ts) => ts < Date.now() - 24 * 3600000).length;
  const licenceBad = u.providers.filter((p) => p.licenceStatus !== "Active").length;
  const offRateCard = u.policies.filter((p) => p.annualPremium > p.sumInsured * 0.28 || p.annualPremium < p.sumInsured * 0.0015).length;
  const extra = [
    { dataset: "bronze_event", dimension: "Timeliness", expectation: "expect_event_within_sla", rule: "kafka consumer lag < 5000 messages per partition", tested: u.bronze.length, failed: Math.round(u.bronze.length * 0.004) },
    { dataset: "bronze_event", dimension: "Validity", expectation: "expect_schema_registry_compatible", rule: "payload validates against registered avro/protobuf schema", tested: u.bronze.length, failed: Math.round(u.bronze.length * 0.019) },
    { dataset: "silver_claim", dimension: "Completeness", expectation: "expect_customer_id_not_null", rule: "claim_customer_id_present", tested: claims, failed: Math.round(claims * 0.008) },
    { dataset: "silver_claim", dimension: "Uniqueness", expectation: "expect_compound_unique_claim_id", rule: "duplicate Kafka deliveries collapsed on claim_id", tested: claims, failed: Math.round(claims * 0.004) },
    { dataset: "silver_customer", dimension: "Completeness", expectation: "expect_customer_full_name_not_null", rule: "customer_full_name_present", tested: u.counts.customers, failed: Math.round(u.counts.customers * 0.022) },
    { dataset: "silver_customer", dimension: "Validity", expectation: "expect_phone_matches_ke_pattern", rule: "phone ~ ^\\+254[17]\\d{8}$ after normalisation", tested: u.counts.customers, failed: Math.round(u.counts.customers * 0.011) },
    { dataset: "silver_customer", dimension: "Validity", expectation: "expect_kyc_verified_against_iprs", rule: "kyc_status == 'Verified' (IPRS match)", tested: u.counts.customers, failed: kycUnverified },
    { dataset: "silver_payment", dimension: "Accuracy", expectation: "expect_mpesa_receipt_reconciled", rule: "M-PESA receipt reconciled with Safaricom D+1 statement", tested: payments, failed: Math.round(payments * 0.013) },
    { dataset: "silver_vehicle", dimension: "Consistency", expectation: "expect_ntsa_inspection_valid", rule: "ntsa_status == 'Inspection Valid'", tested: u.counts.vehicles, failed: ntsaInvalid },
    { dataset: "silver_provider", dimension: "Validity", expectation: "expect_licence_active_for_claiming", rule: "provider licence_status == 'Active'", tested: u.counts.providers, failed: licenceBad },
    { dataset: "silver_policy", dimension: "Consistency", expectation: "expect_premium_within_ratecard_band", rule: "premium within 0.15%–28% of sum insured (rate card)", tested: u.counts.policies, failed: offRateCard },
    { dataset: "silver_telematics", dimension: "Validity", expectation: "expect_device_battery_above_20pct", rule: "battery_pct >= 20 (else score suppressed)", tested: u.counts.telematics, failed: lowBattery },
    { dataset: "silver_telematics", dimension: "Timeliness", expectation: "expect_device_ping_within_24h", rule: "last device ping < 24h old (per tracked device)", tested: trackedDevices, failed: staleDevices },
    { dataset: "gold_fact_claims", dimension: "Accuracy", expectation: "expect_fact_vs_source_reconciliation", rule: "gold claims reconcile to silver claims (row + value)", tested: claims, failed: Math.round(claims * 0.002) },
    { dataset: "gold_fact_premiums", dimension: "Consistency", expectation: "expect_earned_premium_gl_tieout", rule: "earned premium ties out to the general ledger ±0.5%", tested: 8460, failed: 51 },
    { dataset: "gold_dim_location", dimension: "Completeness", expectation: "expect_47_counties_present", rule: "all 47 Kenyan counties dimensioned with sub-counties", tested: 47, failed: 0 },
    { dataset: "external_kmd_rainfall", dimension: "Timeliness", expectation: "expect_feed_freshness_24h", rule: "Kenya Meteorological Department feed refreshed daily", tested: 366, failed: 44 },
    { dataset: "external_knbs_economic", dimension: "Timeliness", expectation: "expect_feed_freshness_30d", rule: "KNBS CPI & county GDP feed refreshed monthly", tested: 96, failed: 3 },
    { dataset: "gold_fact_fraud_events", dimension: "Completeness", expectation: "expect_alert_has_model_provenance", rule: "model_id + feature snapshot present on every alert", tested: 900, failed: 0 },
  ];
  for (const e of extra) {
    const score = ((e.tested - e.failed) / e.tested) * 100;
    rows.push({
      id: `DQ-${String(++i).padStart(4, "0")}`,
      dataset: e.dataset,
      layer: e.dataset.startsWith("bronze") ? "bronze" : e.dataset.startsWith("silver") ? "silver" : "gold",
      dimension: e.dimension,
      expectation: e.expectation,
      rule: e.rule,
      recordsTested: e.tested,
      recordsFailed: e.failed,
      score: Number(score.toFixed(2)),
      severity: score < 95 ? "critical" : score < 99 ? "warning" : "info",
      status: score < 95 ? "failed" : score < 99 ? "warning" : "passed",
      runAt: new Date(Date.now() - (i % 8) * 1800000),
    });
  }
  return rows;
}

export function lineageRows(): Array<typeof S.lineageEdge.$inferInsert> {
  const edges: Array<[string, string, string, string, string, string, number, string]> = [
    ["daraja.mpesa.api", "kafka:insurance.mpesa", "source", "stream", "Kafka Connect (Daraja)", "STK callback → JSON events", 1, "M-PESA premium & claim-settlement receipts"],
    ["sap.fs.policy_admin", "kafka:insurance.policies", "source", "stream", "Debezium CDC", "row-level CDC events", 1, "policy create/update/delete"],
    ["salesforce.crm", "kafka:insurance.customers", "source", "stream", "Debezium CDC", "CDC + entity keys", 2, "customer master"],
    ["iot.gateway.mqtt", "kafka:insurance.telematics", "source", "stream", "MQTT Bridge", "protobuf decode", 1, "OBD-II dongles & fleet trackers"],
    ["core.claims.api", "kafka:insurance.claims", "source", "stream", "Kafka REST Proxy", "FNOL submission events", 1, "first notice of loss"],
    ["kyc.iprs.gov.ke", "s3://insurelake/landing/kyc", "source", "lake", "Airflow: daily_sftp", "CSV → Parquet", 720, "IPRS identity verification"],
    ["knbs.economic", "s3://insurelake/landing/external", "source", "lake", "Airflow: weekly_external", "CSV → Parquet", 10080, "county GDP, inflation, rainfall (KMD)"],
    ["kafka:insurance.claims", "bronze.claims", "stream", "bronze", "Spark Structured Streaming", "append-only JSON write, no transformation", 1, "raw immutable landing zone"],
    ["kafka:insurance.mpesa", "bronze.mpesa", "stream", "bronze", "Spark Structured Streaming", "append-only", 1, "raw payment receipts"],
    ["kafka:insurance.policies", "bronze.policies", "stream", "bronze", "Spark Structured Streaming", "append-only CDC frames", 1, "raw policy change events"],
    ["kafka:insurance.telematics", "bronze.telematics", "stream", "bronze", "Spark Structured Streaming", "append-only", 1, "raw vehicle events"],
    ["kafka:insurance.customers", "bronze.customers", "stream", "bronze", "Spark Structured Streaming", "append-only", 2, "raw customer events"],
    ["s3://insurelake/landing/kyc", "bronze.customers", "lake", "bronze", "Spark Batch", "Parquet → JSON landing", 720, "nightly batch backfill"],
    ["bronze.claims", "silver.claim", "bronze", "silver", "dbt: silver_claim", "dedupe, type coercion, FK validation, quarantine", 5, "cleansed claim conformed table"],
    ["bronze.policies", "silver.policy", "bronze", "silver", "dbt: silver_policy", "CDC collapse by ts_ms, SCD2", 5, "current policy state"],
    ["bronze.customers", "silver.customer", "bronze", "silver", "dbt: silver_customer", "entity resolution on national_id, phone normalisation", 5, "golden customer record"],
    ["bronze.mpesa", "silver.payment", "bronze", "silver", "dbt: silver_payment", "receipt validation, velocity features", 5, "premium & settlement payments"],
    ["bronze.telematics", "silver.telematics", "bronze", "silver", "Spark: silver_telematics", "range clipping, device de-duplication", 2, "vehicle telemetry"],
    ["silver.claim", "gold.fact_claims", "silver", "gold", "dbt: fact_claims", "conform keys, join dims, ultimate = paid + reserve", 10, "claims conformed fact"],
    ["silver.policy", "gold.fact_premiums", "silver", "gold", "dbt: fact_premiums", "monthly earned/written premium snapshot", 60, "premium periodic snapshot"],
    ["silver.payment", "gold.fact_payments", "silver", "gold", "dbt: fact_payments", "channel conformance", 30, "payment transaction fact"],
    ["silver.telematics", "gold.fact_vehicle_events", "silver", "gold", "dbt: fact_vehicle_events", "driver score aggregation", 60, "telematics aggregate"],
    ["silver.claim", "ml.fraud_feature_store", "silver", "ml", "Spark: fraud_features", "19 features, point-in-time correct", 3, "offline + online feature parity"],
    ["silver.telematics", "ml.fraud_feature_store", "silver", "ml", "Spark: fraud_features", "telematics rollups", 3, "harsh events, night ratio"],
    ["ml.fraud_feature_store", "ml.model_registry", "ml", "ml", "MLflow", "GLM + Isolation Forest + ensemble", 15, "trained & validated models"],
    ["ml.model_registry", "gold.fact_fraud_events", "ml", "gold", "Spark: score_claims", "batch scoring + streaming scoring", 5, "fraud alerts mart"],
    ["gold.fact_claims", "actuarial.dev_triangle", "gold", "actuarial", "R: chainladder", "paid & incurred triangles", 60, "development triangles"],
    ["actuarial.dev_triangle", "actuarial.reserve_result", "actuarial", "actuarial", "R: chainladder/Mack", "CL, BF, Cape Cod, Mack SE", 60, "IBNR & ultimates"],
    ["gold.fact_claims", "actuarial.pricing_segment", "gold", "actuarial", "Python: Tweedie GLM", "frequency × severity", 60, "pure premium relativities"],
    ["gold.fact_claims", "bi.executive_dashboard", "gold", "bi", "Trino → Next.js", "SQL marts over Iceberg", 15, "INSURELAKE control centre"],
    ["gold.fact_fraud_events", "bi.fraud_console", "gold", "bi", "Trino → Next.js", "alert queue + network graph", 5, "SIU investigation console"],
    ["actuarial.reserve_result", "bi.actuarial_dashboard", "actuarial", "bi", "Trino → Next.js", "IBNR, Mack CV, reserve adequacy", 60, "reserving & pricing dashboard"],
    ["silver.claim", "governance.dq_check", "silver", "governance", "Great Expectations", "26 expectations per run", 10, "quality scoring"],
    ["bronze.claims", "governance.lineage_edge", "bronze", "governance", "OpenMetadata", "column-level lineage harvest", 1440, "end-to-end lineage"],
  ];
  return edges.map((e, i) => ({
    id: `LIN-${String(i + 1).padStart(3, "0")}`,
    sourceNode: e[0],
    targetNode: e[1],
    sourceLayer: e[2],
    targetLayer: e[3],
    engine: e[4],
    transformation: e[5],
    slaMinutes: e[6],
    description: e[7],
  }));
}

function catalogRows(u: Universe, counts: Record<string, number>): Array<typeof S.catalogEntry.$inferInsert> {
  const bytesPer = (n: number, w = 340) => (n * w) / 1024 / 1024;
  const rows: Array<{
    dataset: string; layer: string; domain: string; fmt: string; file: string; loc: string; rowsN: number; sizeMb: number;
    owner: string; cls: string; pii: boolean; desc: string; columns: Array<{ name: string; type: string; nullable: boolean; pii: boolean }>; partitions: string[]; snapshots: number;
  }> = [
    { dataset: "bronze.claims", layer: "bronze", domain: "Claims", fmt: "Iceberg v2", file: "JSON", loc: "s3a://insurelake/bronze/claims/", rowsN: u.counts.claims + 400, sizeMb: bytesPer(counts.bronze / 4), owner: "Data Engineering — Ingestion", cls: "Confidential", pii: true, desc: "Immutable FNOL events exactly as received from the policy admin core. Never updated.", columns: [{ name: "claim_id", type: "string", nullable: false, pii: false }, { name: "claim_amount", type: "decimal(18,2)|string", nullable: false, pii: false }, { name: "customer_id", type: "string", nullable: true, pii: true }, { name: "claim_date", type: "date", nullable: false, pii: false }, { name: "location", type: "string", nullable: false, pii: false }, { name: "currency", type: "string", nullable: true, pii: false }, { name: "fraud_score", type: "double", nullable: true, pii: false }], partitions: ["dt=YYYY/MM/DD"], snapshots: 214 },
    { dataset: "bronze.mpesa", layer: "bronze", domain: "Payments", fmt: "Iceberg v2", file: "JSON", loc: "s3a://insurelake/bronze/mpesa/", rowsN: counts.payments, sizeMb: bytesPer(counts.payments, 290), owner: "Data Engineering — Ingestion", cls: "Restricted", pii: true, desc: "Daraja M-PESA receipts including MSISDN — column-masked for analysts.", columns: [{ name: "payment_id", type: "string", nullable: false, pii: false }, { name: "mpesa_receipt", type: "string", nullable: true, pii: false }, { name: "msisdn", type: "string", nullable: true, pii: true }, { name: "amount", type: "decimal(18,2)", nullable: false, pii: false }], partitions: ["dt=YYYY/MM/DD"], snapshots: 188 },
    { dataset: "bronze.telematics", layer: "bronze", domain: "IoT", fmt: "Iceberg v2", file: "Parquet", loc: "s3a://insurelake/bronze/telematics/", rowsN: counts.telematics, sizeMb: bytesPer(counts.telematics, 210), owner: "Data Engineering — IoT", cls: "Internal", pii: true, desc: "OBD-II / fleet tracker events at up to 1Hz, compacted hourly.", columns: [{ name: "event_id", type: "string", nullable: false, pii: false }, { name: "device_id", type: "string", nullable: false, pii: false }, { name: "speed_kmh", type: "double", nullable: false, pii: false }, { name: "harsh_braking", type: "int", nullable: false, pii: false }], partitions: ["dt=YYYY/MM/DD", "hour=HH"], snapshots: 412 },
    { dataset: "bronze.policies", layer: "bronze", domain: "Policy Admin", fmt: "Iceberg v2", file: "JSON", loc: "s3a://insurelake/bronze/policies/", rowsN: counts.policies, sizeMb: bytesPer(counts.policies, 420), owner: "Data Engineering — CDC", cls: "Confidential", pii: true, desc: "Debezium CDC frames (op_type c/u/d) from the core insurance database.", columns: [{ name: "policy_id", type: "string", nullable: false, pii: false }, { name: "op_type", type: "string", nullable: false, pii: false }, { name: "ts_ms", type: "long", nullable: false, pii: false }], partitions: ["dt=YYYY/MM/DD"], snapshots: 96 },
    { dataset: "silver.customer", layer: "silver", domain: "Customer 360", fmt: "Iceberg v2 (SCD2)", file: "Parquet", loc: "s3a://insurelake/silver/customer/", rowsN: counts.customers, sizeMb: bytesPer(counts.customers, 380), owner: "Data Engineering — Core", cls: "Restricted", pii: true, desc: "Golden customer record after entity resolution on national_id and E.164 phone normalisation.", columns: [{ name: "customer_key", type: "string", nullable: false, pii: false }, { name: "national_id", type: "string", nullable: true, pii: true }, { name: "phone", type: "string", nullable: false, pii: true }, { name: "county_code", type: "string", nullable: false, pii: false }, { name: "resolved_duplicate_of", type: "string", nullable: true, pii: false }], partitions: ["county_code"], snapshots: 74 },
    { dataset: "silver.claim", layer: "silver", domain: "Claims", fmt: "Iceberg v2", file: "Parquet", loc: "s3a://insurelake/silver/claim/", rowsN: counts.claims, sizeMb: bytesPer(counts.claims, 330), owner: "Data Engineering — Core", cls: "Confidential", pii: true, desc: "Deduplicated, FK-validated claims with quality flags and quarantine lineage.", columns: [{ name: "claim_key", type: "string", nullable: false, pii: false }, { name: "amount_claimed", type: "decimal(18,2)", nullable: false, pii: false }, { name: "dedupe_score", type: "double", nullable: false, pii: false }, { name: "quality_flags", type: "array<string>", nullable: false, pii: false }], partitions: ["claim_year", "claim_month"], snapshots: 121 },
    { dataset: "silver.policy", layer: "silver", domain: "Policy Admin", fmt: "Iceberg v2 (SCD2)", file: "Parquet", loc: "s3a://insurelake/silver/policy/", rowsN: counts.policies, sizeMb: bytesPer(counts.policies, 360), owner: "Data Engineering — Core", cls: "Confidential", pii: true, desc: "Current policy state with valid_from/valid_to history for premium leakage analysis.", columns: [{ name: "policy_key", type: "string", nullable: false, pii: false }, { name: "annual_premium", type: "decimal(18,2)", nullable: false, pii: false }, { name: "status", type: "string", nullable: false, pii: false }, { name: "is_current", type: "boolean", nullable: false, pii: false }], partitions: ["lob"], snapshots: 68 },
    { dataset: "gold.fact_claims", layer: "gold", domain: "Claims Mart", fmt: "Iceberg v2", file: "Parquet", loc: "s3a://insurelake/gold/fact_claims/", rowsN: counts.factClaims, sizeMb: bytesPer(counts.factClaims, 260), owner: "Analytics Engineering", cls: "Confidential", pii: false, desc: "Conformed claims fact joined to 7 dimensions; powers loss ratio, IBNR and fraud marts.", columns: [{ name: "claim_key", type: "string", nullable: false, pii: false }, { name: "date_key", type: "int", nullable: false, pii: false }, { name: "location_key", type: "int", nullable: false, pii: false }, { name: "fraud_score", type: "double", nullable: false, pii: false }, { name: "ultimate_amount", type: "decimal(18,2)", nullable: false, pii: false }], partitions: ["year_month", "lob"], snapshots: 57 },
    { dataset: "gold.fact_premiums", layer: "gold", domain: "Premium Mart", fmt: "Iceberg v2", file: "Parquet", loc: "s3a://insurelake/gold/fact_premiums/", rowsN: counts.factPremiums, sizeMb: bytesPer(counts.factPremiums, 200), owner: "Analytics Engineering", cls: "Internal", pii: false, desc: "Periodic snapshot: written, earned premium, commission and in-force counts by month/LOB/county.", columns: [{ name: "year_month", type: "string", nullable: false, pii: false }, { name: "earned_premium", type: "decimal(18,2)", nullable: false, pii: false }, { name: "policies_in_force", type: "int", nullable: false, pii: false }], partitions: ["year_month"], snapshots: 44 },
    { dataset: "gold.fact_fraud_events", layer: "gold", domain: "Fraud Mart", fmt: "Iceberg v2", file: "Parquet", loc: "s3a://insurelake/gold/fact_fraud_events/", rowsN: counts.factFraud, sizeMb: bytesPer(counts.factFraud, 900), owner: "Fraud Analytics (SIU)", cls: "Restricted", pii: true, desc: "Scored fraud alerts with model provenance, feature snapshot, reasons and network links.", columns: [{ name: "alert_id", type: "string", nullable: false, pii: false }, { name: "fraud_score", type: "double", nullable: false, pii: false }, { name: "reasons", type: "array<struct>", nullable: false, pii: false }, { name: "network_links", type: "array<struct>", nullable: false, pii: true }], partitions: ["year_month"], snapshots: 39 },
    { dataset: "gold.dim_location", layer: "gold", domain: "Geography", fmt: "Iceberg v2", file: "Parquet", loc: "s3a://insurelake/gold/dim_location/", rowsN: 47, sizeMb: 0.02, owner: "Analytics Engineering", cls: "Internal", pii: false, desc: "47 Kenyan counties with sub-county, ward, coordinates, urban/rural flag and KNBS/KMD risk indices.", columns: [{ name: "county_code", type: "string", nullable: false, pii: false }, { name: "risk_zone", type: "string", nullable: false, pii: false }, { name: "road_risk_index", type: "double", nullable: false, pii: false }], partitions: [], snapshots: 12 },
  ];
  return rows.map((r, i) => ({
    id: `CAT-${String(i + 1).padStart(3, "0")}`,
    dataset: r.dataset,
    layer: r.layer,
    domain: r.domain,
    tableFormat: r.fmt,
    fileFormat: r.file,
    location: r.loc,
    rows: r.rowsN,
    sizeMb: Number(r.sizeMb.toFixed(2)),
    owner: r.owner,
    classification: r.cls,
    pii: r.pii,
    description: r.desc,
    columns: r.columns,
    partitions: r.partitions,
    snapshots: r.snapshots,
  }));
}

function schemaVersions(): Array<typeof S.schemaVersion.$inferInsert> {
  const now = Date.now();
  const rows: Array<[string, number, number, boolean, string[], string]> = [
    ["insurance.claims", 1, now - 620 * 86400000, true, ["claim_id", "policy_id", "customer_id", "claim_date", "claim_amount", "claim_type", "location", "status"], "Initial FNOL contract published by the policy admin core."],
    ["insurance.claims", 2, now - 410 * 86400000, true, ["currency", "cause", "report_date", "amount_paid", "reserve"], "Multi-currency support for cross-border (EAC) motor policies — backwards compatible."],
    ["insurance.claims", 3, now - 140 * 86400000, true, ["fraud_score", "channel_of_report", "provider_id"], "Fraud score push-back and provider linkage for network analytics."],
    ["insurance.payments", 1, now - 600 * 86400000, true, ["payment_id", "policy_id", "amount", "channel", "paid_at"], "Payments core contract."],
    ["insurance.payments", 2, now - 380 * 86400000, true, ["currency", "payment_type", "county"], "Added county for M-PESA geographic velocity features."],
    ["insurance.telematics", 3, now - 300 * 86400000, true, ["device_id", "speed_kmh", "harsh_braking", "harsh_acceleration"], "Protobuf v3 with OBD-II PID decode."],
    ["insurance.telematics", 4, now - 90 * 86400000, false, ["night_driving_km", "battery_pct", "ignition"], "v4 renamed raw_speed → speed_kmh; consumers must dual-read for 30 days."],
    ["insurance.policies", 2, now - 350 * 86400000, true, ["op_type", "ts_ms", "renewal_count"], "CDC envelope fields added for incremental SCD2 processing."],
  ];
  return rows.map((r, i) => ({
    id: `SCH-${String(i + 1).padStart(3, "0")}`,
    dataset: r[0],
    version: r[1],
    releasedAt: new Date(r[2]),
    compatible: r[3],
    addedFields: r[4],
    events: 0,
    note: r[5],
  }));
}

function pipelineRuns(u: Universe): Array<typeof S.pipelineRun.$inferInsert> {
  const dags = [
    { dag: "insurelake_bronze_ingest", task: "spark_streaming_landing", layer: "bronze", engine: "Spark Structured Streaming", mode: "micro-batch (30s)", records: u.counts.bronze_events, dur: [900, 2600] },
    { dag: "insurelake_silver_claims", task: "dbt_silver_claim", layer: "silver", engine: "dbt-core + Trino", mode: "incremental (watermark)", records: u.counts.claims, dur: [12000, 38000] },
    { dag: "insurelake_silver_customers", task: "entity_resolution", layer: "silver", engine: "Spark (Zingg)", mode: "incremental (watermark)", records: u.counts.customers, dur: [9000, 22000] },
    { dag: "insurelake_gold_marts", task: "dbt_build_gold", layer: "gold", engine: "dbt-core + Trino", mode: "incremental (merge)", records: u.counts.claims + u.counts.payments, dur: [26000, 61000] },
    { dag: "insurelake_fraud_scoring", task: "spark_score_claims", layer: "ml", engine: "Spark ML + MLflow", mode: "streaming + nightly batch", records: u.counts.claims, dur: [7000, 19000] },
    { dag: "insurelake_actuarial_reserving", task: "r_chainladder_mack", layer: "actuarial", engine: "R (chainladder, actuar)", mode: "full refresh", records: 5 * 14, dur: [4200, 9800] },
    { dag: "insurelake_dq_great_expectations", task: "ge_checkpoint", layer: "governance", engine: "Great Expectations", mode: "post-hook", records: u.counts.claims, dur: [3100, 7400] },
    { dag: "insurelake_metadata_harvest", task: "openmetadata_lineage", layer: "governance", engine: "OpenMetadata Ingestion", mode: "daily", records: 34, dur: [5200, 12400] },
    { dag: "insurelake_iceberg_maintenance", task: "expire_snapshots_compact", layer: "bronze", engine: "Spark (Iceberg procedures)", mode: "weekly", records: 0, dur: [18000, 44000] },
  ];
  const rows: Array<typeof S.pipelineRun.$inferInsert> = [];
  let n = 0;
  for (let day = 0; day < 9; day++) {
    for (const d of dags) {
      const started = new Date(Date.now() - day * 86400000 - (n % 5) * 3600000 - 7200000);
      const failed = day === 2 && d.dag === "insurelake_silver_claims";
      const duration = Math.round(d.dur[0] + Math.random() * (d.dur[1] - d.dur[0]));
      const rejected = Math.round(d.records * (failed ? 0.031 : 0.0018 + (n % 4) * 0.0006));
      rows.push({
        runId: `run_${started.toISOString().slice(0, 10).replace(/-/g, "")}_${d.dag}`,
        dagId: d.dag,
        taskName: d.task,
        layer: d.layer,
        engine: d.engine,
        status: failed ? "failed" : n % 17 === 5 ? "success_with_warnings" : "success",
        mode: d.mode,
        startedAt: started,
        durationMs: duration,
        recordsIn: d.records,
        recordsOut: Math.max(0, d.records - rejected),
        recordsRejected: rejected,
        watermark: new Date(started.getTime() - 86400000).toISOString().slice(0, 10),
        logicalDate: started.toISOString().slice(0, 10),
      });
      n++;
    }
  }
  return rows;
}

function streamMetrics(u: Universe): Array<typeof S.streamMetric.$inferInsert> {
  const rows: Array<typeof S.streamMetric.$inferInsert> = [];
  const base: Record<string, number> = {
    "insurance.telematics": 340,
    "insurance.payments": 92,
    "insurance.mpesa": 128,
    "insurance.claims": 24,
    "insurance.policies": 18,
    "insurance.customers": 11,
    "insurance.interactions": 46,
    "insurance.fraud_alerts": 3.4,
  };
  let id = 0;
  for (const t of KAFKA_TOPICS) {
    let offset = 40_000_000 + Math.round(Math.random() * 9_000_000);
    for (let i = 29; i >= 0; i--) {
      const ts = new Date(Date.now() - i * 60000);
      const eps = Math.max(0.2, (base[t.topic] ?? 20) * (0.72 + Math.random() * 0.62));
      offset += Math.round(eps * 60);
      rows.push({
        id: `SM-${String(++id).padStart(5, "0")}`,
        topic: t.topic,
        ts,
        eventsPerSec: Number(eps.toFixed(1)),
        lag: Math.round(220 + Math.random() * 2600),
        p95LatencyMs: Number((180 + Math.random() * 720).toFixed(0)),
        partitions: t.partitions,
        offset,
      });
    }
  }
  void u;
  return rows;
}

function modelRows(
  glm: LogisticModel,
  isoModel: LogisticModel,
  ensAuc: number,
  churnModel: LogisticModel,
  triangles: Record<string, { ibnr: number; ultimate: number; se: number; cv: number; ldf: number[] }>,
  trainRows: number,
  iso: number[],
  y: number[],
  u: Universe,
  bounds: { min: number[]; max: number[] },
): Array<typeof S.modelRegistry.$inferInsert> {
  const isoAuc = aucOf(iso, y);
  const now = Date.now();
  const cv = triangles.Motor ? triangles.Motor.cv : 0.12;
  return [
    {
      modelId: "fraud-ensemble-v3",
      name: "Claim Fraud Ensemble",
      family: "GLM Binomial (L2) + Isolation Forest + rule engine",
      version: "v3.4.1",
      stage: "production",
      task: "binary-classification",
      metricName: "roc_auc (holdout)",
      metricValue: Number(ensAuc.toFixed(4)),
      secondaryMetrics: { precision: Number((glm.metrics.precision).toFixed(3)), recall: Number(glm.metrics.recall.toFixed(3)), f1: Number(glm.metrics.f1.toFixed(3)), ks: Number(glm.metrics.ks.toFixed(3)), lift_top10: Number(glm.metrics.liftTop10.toFixed(2)), glm_auc: Number(glm.metrics.auc.toFixed(4)), isolation_auc: Number(isoAuc.toFixed(4)) },
      params: { blend: { glm: 0.84, isolation: 0.16 }, epochs: glm.epochs, l2: 0.006, lr: 0.09, weights: glm.weights.map((w) => Number(w.toFixed(6))), bias: Number(glm.bias.toFixed(6)), means: glm.means.map((m) => Number(m.toFixed(4))), stds: glm.stds.map((s) => Number(s.toFixed(4))), featureNames: glm.featureNames, bounds: { min: bounds.min.map((v) => Number(v.toFixed(4))), max: bounds.max.map((v) => Number(v.toFixed(4))) } },
      features: FRAUD_FEATURE_NAMES,
      trainingRows: trainRows,
      runTimeMs: 1840,
      trainedAt: new Date(now - 3 * 3600000),
      owner: "Fraud Analytics (SIU)",
      driftPct: 2.4,
    },
    {
      modelId: "fraud-glm-logit-v2",
      name: "Claim Fraud GLM (baseline)",
      family: "Logistic Regression (binomial GLM)",
      version: "v2.9.0",
      stage: "archived",
      task: "binary-classification",
      metricName: "roc_auc (holdout)",
      metricValue: Number((glm.metrics.auc * 0.965).toFixed(4)),
      secondaryMetrics: { precision: Number((glm.metrics.precision * 0.9).toFixed(3)), recall: Number((glm.metrics.recall * 0.94).toFixed(3)), ks: Number((glm.metrics.ks * 0.93).toFixed(3)) },
      params: { epochs: 150, l2: 0.01, note: "superseded by fraud-ensemble-v3 after telematics features were added" },
      features: FRAUD_FEATURE_NAMES.slice(0, 14),
      trainingRows: Math.round(trainRows * 0.72),
      runTimeMs: 940,
      trainedAt: new Date(now - 190 * 86400000),
      owner: "Fraud Analytics (SIU)",
      driftPct: 11.8,
    },
    {
      modelId: "fraud-isolation-forest",
      name: "Unsupervised Claim Anomaly",
      family: "Isolation Forest (percentile surrogate)",
      version: "v1.6.2",
      stage: "production",
      task: "anomaly-detection",
      metricName: "roc_auc vs SIU labels",
      metricValue: Number(isoAuc.toFixed(4)),
      secondaryMetrics: { contamination: 0.05, n_estimators: 400, auc_isolation_lr: Number(isoModel.metrics.auc.toFixed(4)) },
      params: { contamination: 0.05, n_estimators: 400, max_samples: 0.8 },
      features: FRAUD_FEATURE_NAMES,
      trainingRows: trainRows,
      runTimeMs: 620,
      trainedAt: new Date(now - 26 * 3600000),
      owner: "Data Science Guild",
      driftPct: 3.1,
    },
    {
      modelId: "pricing-tweedie-glm",
      name: "Motor Pure-Premium Tweedie GLM",
      family: "Tweedie GLM (p=1.5) with log link",
      version: "v4.1.0",
      stage: "production",
      task: "regression",
      metricName: "deviance_explained",
      metricValue: 0.3874,
      secondaryMetrics: { aic: 418220, phi: 1.42, gini: 0.412, frequency_model: "Poisson GLM", severity_model: "Gamma GLM" },
      params: { power: 1.5, link: "log", offset: "earned_exposure", factors: ["county_risk_zone", "age_band", "cover_type", "vehicle_body", "usage", "telematics_driver_score"] },
      features: ["exposure", "county_risk_zone", "age_band", "cover_type", "body_type", "usage", "driver_score", "sum_insured"],
      trainingRows: u.counts.policies,
      runTimeMs: 5240,
      trainedAt: new Date(now - 62 * 3600000),
      owner: "Actuarial — Pricing",
      driftPct: 1.8,
    },
    {
      modelId: "churn-propensity-logit",
      name: "Policyholder Churn Propensity",
      family: "Logistic Regression",
      version: "v2.2.0",
      stage: "production",
      task: "binary-classification",
      metricName: "roc_auc (holdout)",
      metricValue: Number(churnModel.metrics.auc.toFixed(4)),
      secondaryMetrics: { precision: Number(churnModel.metrics.precision.toFixed(3)), recall: Number(churnModel.metrics.recall.toFixed(3)), ks: Number(churnModel.metrics.ks.toFixed(3)) },
      params: { weights: churnModel.weights.map((w) => Number(w.toFixed(4))), bias: Number(churnModel.bias.toFixed(4)), means: churnModel.means.map((m) => Number(m.toFixed(3))), stds: churnModel.stds.map((s) => Number(s.toFixed(3))) },
      features: churnModel.featureNames,
      trainingRows: churnModel.metrics.trainRows + churnModel.metrics.testRows,
      runTimeMs: 780,
      trainedAt: new Date(now - 11 * 3600000),
      owner: "Customer Analytics",
      driftPct: 4.2,
    },
    {
      modelId: "reserving-chain-ladder-mack",
      name: "Claims Reserving (CL + Mack)",
      family: "Deterministic chain ladder with Mack (1993) stochastic SE",
      version: "v1.9.4",
      stage: "production",
      task: "reserving",
      metricName: "mack_cv_total",
      metricValue: Number(cv.toFixed(4)),
      secondaryMetrics: Object.fromEntries(Object.entries(triangles).map(([k, v]) => [`ibnr_${k}`, Math.round(v.ibnr)])),
      params: { tail_factor: 1.0, ldf_method: "volume_weighted", ldf_motor: triangles.Motor?.ldf.map((x) => Number(x.toFixed(3))) ?? [] },
      features: ["origin_period", "dev_period", "paid_incremental", "incurred_incremental", "earned_premium"],
      trainingRows: 5 * 14 * 14,
      runTimeMs: 412,
      trainedAt: new Date(now - 90 * 60000),
      owner: "Actuarial — Reserving",
      driftPct: 0.9,
    },
    {
      modelId: "fraud-graph-community",
      name: "Fraud Ring Community Detection",
      family: "Graph — Louvain communities + PageRank",
      version: "v1.2.0",
      stage: "staging",
      task: "graph-analytics",
      metricName: "rings_detected",
      metricValue: u.fraudRings.length,
      secondaryMetrics: { nodes: 4820, edges: 19240, modularity: 0.61 },
      params: { resolution: 1.15, min_community: 4 },
      features: ["claimant", "provider", "vehicle", "bank_account", "phone", "address"],
      trainingRows: u.counts.claims,
      runTimeMs: 3120,
      trainedAt: new Date(now - 30 * 3600000),
      owner: "Fraud Analytics (SIU)",
      driftPct: 5.6,
    },
    {
      modelId: "telematics-driver-score",
      name: "Telematics Driver Score (PHYD)",
      family: "Gradient Boosted Trees",
      version: "v3.0.2",
      stage: "production",
      task: "regression",
      metricName: "r2_claim_frequency",
      metricValue: 0.412,
      secondaryMetrics: { mae: 6.8, features: 22, coverage_pct: 34 },
      params: { n_estimators: 300, max_depth: 6, learning_rate: 0.06 },
      features: ["harsh_braking", "harsh_acceleration", "night_km_ratio", "avg_speed", "distance_km", "county_road_risk"],
      trainingRows: u.counts.telematics,
      runTimeMs: 2210,
      trainedAt: new Date(now - 74 * 3600000),
      owner: "Data Science Guild",
      driftPct: 2.9,
    },
  ];
}

function buildChurnDataset(
  u: Universe,
  policies: Array<{ policyId: string; customerId: string; status: string; startDate: string; annualPremium: number }>,
  payments: Array<{ customerId: string; paidAt: Date; status: string }>,
  claims: Array<{ customerId: string; claimDate: string }>,
) {
  const features = ["tenure_months", "policy_count", "claim_count_12m", "payment_failures", "days_since_last_payment", "premium_intensity", "kyc_verified", "county_churn_index", "agent_persistency"];
  const byCustomer = new Map<string, { policies: number; lapsed: number; premium: number; start: string }>();
  for (const p of policies) {
    const a = byCustomer.get(p.customerId) ?? { policies: 0, lapsed: 0, premium: 0, start: p.startDate };
    a.policies += 1;
    a.premium += p.annualPremium;
    if (p.status === "Lapsed" || p.status === "Cancelled") a.lapsed += 1;
    if (p.startDate > a.start) a.start = p.startDate;
    byCustomer.set(p.customerId, a);
  }
  const lastPay = new Map<string, number>();
  const failures = new Map<string, number>();
  for (const p of payments) {
    const t = p.paidAt.getTime();
    if (p.status === "Successful") lastPay.set(p.customerId, Math.max(lastPay.get(p.customerId) ?? 0, t));
    else failures.set(p.customerId, (failures.get(p.customerId) ?? 0) + 1);
  }
  const claimCount = new Map<string, number>();
  for (const c of claims) {
    if (Date.now() - Date.parse(c.claimDate) < 365 * 86400000) claimCount.set(c.customerId, (claimCount.get(c.customerId) ?? 0) + 1);
  }
  const agentPersistency = new Map(u.agents.map((a) => [a.agentId, a.persistencyRate]));
  void agentPersistency;
  const X: number[][] = [];
  const y: number[] = [];
  for (const cust of u.customers) {
    const a = byCustomer.get(cust.customerId);
    if (!a) continue;
    const tenure = Math.max(0, (Date.now() - Date.parse(a.start)) / (30.4 * 86400000));
    const dslp = lastPay.has(cust.customerId) ? (Date.now() - (lastPay.get(cust.customerId) ?? 0)) / 86400000 : 1100;
    const ref = COUNTIES.find((c) => c.code === cust.countyCode);
    const churnIndex = ref ? (1 - ref.gdpIndex) * 0.5 + ref.roadRisk * 0.2 : 0.4;
    X.push([tenure, a.policies, claimCount.get(cust.customerId) ?? 0, failures.get(cust.customerId) ?? 0, dslp, a.premium / 120000, cust.kycStatus === "Verified" ? 1 : 0, churnIndex, cust.riskProfile]);
    y.push(a.lapsed > 0 && dslp > 150 ? 1 : 0);
  }
  return { X, y, features };
}
