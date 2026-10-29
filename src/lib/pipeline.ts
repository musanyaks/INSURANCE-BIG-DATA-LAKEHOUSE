/**
 * INSURELAKE pipeline layer.
 *
 * bronze → silver : dedupe, schema validation, type coercion, null handling,
 *                   standardisation, referential integrity, entity resolution,
 *                   quarantine + Great-Expectations style quality counters.
 * silver → gold   : conformed dimensions & fact marts.
 */
import { COUNTIES } from "./kenya";
import type { BronzeRow, SrcAgent, SrcProvider, SrcTelematics, SrcVehicle, Universe } from "./sim";

export type DqCounter = { tested: number; failed: number };
export type Rejection = { reason: string; dataset: string; count: number; severity: "critical" | "warning" | "info"; example?: string };
export type Quality = { counters: Record<string, DqCounter>; rejections: Rejection[]; lateArriving: number };

const COUNTY_LOOKUP = new Map<string, string>();
for (const c of COUNTIES) {
  COUNTY_LOOKUP.set(c.name.toLowerCase(), c.code);
  COUNTY_LOOKUP.set(c.name.toLowerCase().replace(/[-']/g, " "), c.code);
  COUNTY_LOOKUP.set(c.capital.toLowerCase(), c.code);
}
COUNTY_LOOKUP.set("nairobi city", "047");
COUNTY_LOOKUP.set("mombasa city", "001");

export function resolveCounty(raw: unknown): { code: string; name: string; matched: boolean } {
  const fallback = { code: "047", name: "Nairobi", matched: false };
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const key = raw.trim().toLowerCase();
  const code = COUNTY_LOOKUP.get(key);
  if (!code) return fallback;
  const c = COUNTIES.find((x) => x.code === code);
  return c ? { code: c.code, name: c.name, matched: true } : fallback;
}

export function normalizePhone(raw: unknown): { phone: string | null; valid: boolean } {
  if (typeof raw !== "string") return { phone: null, valid: false };
  const digits = raw.replace(/[^\d]/g, "");
  let local = digits;
  if (local.startsWith("254")) local = local.slice(3);
  if (local.startsWith("0")) local = local.slice(1);
  if (local.length !== 9 || !local.startsWith("7") && !local.startsWith("1")) return { phone: null, valid: false };
  return { phone: `+254${local}`, valid: true };
}

export function coerceNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function hashRow(obj: unknown): string {
  const s = JSON.stringify(obj);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export const dateKeyOf = (d: string | Date): number => {
  const dt = typeof d === "string" ? new Date(d.length <= 10 ? d + "T00:00:00Z" : d.replace(" ", "T") + "Z") : d;
  return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
};

export const yearMonthOf = (d: string | Date): string => {
  const dt = typeof d === "string" ? new Date(d.length <= 10 ? d + "T00:00:00Z" : d.replace(" ", "T") + "Z") : d;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const quarterOf = (d: string | Date): string => {
  const dt = typeof d === "string" ? new Date(d.length <= 10 ? d + "T00:00:00Z" : d.replace(" ", "T") + "Z") : d;
  return `${dt.getUTCFullYear()}Q${Math.floor(dt.getUTCMonth() / 3) + 1}`;
};

export function ageBand(birthDate: string, asOf: Date): string {
  const age = Math.floor((asOf.getTime() - Date.parse(birthDate)) / (365.25 * 86400000));
  return age < 26 ? "18-25" : age < 36 ? "26-35" : age < 46 ? "36-45" : age < 56 ? "46-55" : age < 66 ? "56-65" : "65+";
}

function byTopic(bronze: BronzeRow[], topic: string) {
  return bronze.filter((b) => b.topic === topic);
}

export type SilverCustomerRow = {
  customerKey: string; customerId: string; fullName: string; nationalId: string | null; phone: string;
  gender: string; birthDate: string; ageBand: string; countyCode: string; countyName: string; subCounty: string;
  ward: string | null; latitude: number; longitude: number; urbanRural: string; riskZone: string; occupation: string;
  incomeBand: string; kycStatus: string; channel: string; resolvedDuplicateOf: string | null; rowHash: string;
  firstSeenAt: Date; lastUpdatedAt: Date;
};

export function silverCustomers(bronze: BronzeRow[], asOf: Date): { rows: SilverCustomerRow[]; q: Quality } {
  const q: Quality = { counters: {}, rejections: [], lateArriving: 0 };
  const c = (k: string) => (q.counters[k] ??= { tested: 0, failed: 0 });
  const events = byTopic(bronze, "insurance.customers").sort((a, b) => a.eventTime.localeCompare(b.eventTime));
  const latest = new Map<string, BronzeRow>();
  for (const e of events) {
    const id = String(e.payload.customer_id ?? "");
    c("customer_uniqueness").tested++;
    if (latest.has(id)) {
      c("customer_uniqueness").failed++;
      latest.set(id, e);
    } else latest.set(id, e);
  }
  const rows: SilverCustomerRow[] = [];
  const byNatId = new Map<string, string>();
  for (const e of latest.values()) {
    const p = e.payload as Record<string, unknown>;
    const county = resolveCounty(p.county);
    const cc = c("customer_completeness");
    cc.tested++;
    if (typeof p.full_name !== "string" || !p.full_name) {
      cc.failed++;
      q.rejections.push({ reason: "full_name is null — quarantined to dq_quarantine", dataset: "silver_customer", count: 1, severity: "warning" });
      continue;
    }
    const phone = normalizePhone(p.phone);
    const vc = c("phone_validity");
    vc.tested++;
    if (!phone.valid) vc.failed++;
    const birth = String(p.birth_date ?? "");
    const band = ageBand(birth, asOf);
    const consistency = c("age_band_consistency");
    consistency.tested++;
    if (String(p.age_band ?? band) !== band && p.age_band) consistency.failed++;
    const natId = typeof p.national_id === "string" ? p.national_id : null;
    let dup: string | null = null;
    if (natId) {
      const seen = byNatId.get(natId);
      if (seen) dup = seen;
      else byNatId.set(natId, String(p.customer_id));
    }
    const ref = COUNTIES.find((x) => x.code === county.code)!;
    rows.push({
      customerKey: `CUSK-${String(p.customer_id).replace("CUS-", "")}`,
      customerId: String(p.customer_id),
      fullName: String(p.full_name),
      nationalId: natId,
      phone: phone.phone ?? "",
      gender: String(p.gender ?? "U"),
      birthDate: birth,
      ageBand: band,
      countyCode: county.code,
      countyName: county.name,
      subCounty: String(p.sub_county ?? ref.subCounties[0]),
      ward: typeof p.ward === "string" ? p.ward : null,
      latitude: ref.lat,
      longitude: ref.lng,
      urbanRural: ref.urbanRural,
      riskZone: ref.riskZone,
      occupation: String(p.occupation ?? "Unknown"),
      incomeBand: String(p.income_band ?? "Unknown"),
      kycStatus: String(p.kyc_status ?? "Pending"),
      channel: String(p.channel ?? "Direct Digital"),
      resolvedDuplicateOf: dup,
      rowHash: hashRow(p),
      firstSeenAt: new Date(e.eventTime.replace(" ", "T") + "Z"),
      lastUpdatedAt: new Date(e.eventTime.replace(" ", "T") + "Z"),
    });
  }
  const er = c("entity_resolution");
  er.tested = rows.length;
  er.failed = rows.filter((x) => x.resolvedDuplicateOf).length;
  if (er.failed) q.rejections.push({ reason: `${er.failed} customers merged by national_id entity resolution`, dataset: "silver_customer", count: er.failed, severity: "info" });
  return { rows, q };
}

export type SilverPolicyRow = {
  policyKey: string; policyId: string; customerId: string; product: string; lob: string; coverType: string;
  agentId: string; startDate: string; endDate: string; status: string; annualPremium: number; sumInsured: number;
  excess: number; paymentFrequency: string; countyCode: string; countyName: string; renewalCount: number;
  commissionRate: number; validFrom: string; validTo: string | null; isCurrent: boolean; rowHash: string;
};

export function silverPolicies(bronze: BronzeRow[], agents: SrcAgent[]): { rows: SilverPolicyRow[]; q: Quality } {
  const q: Quality = { counters: {}, rejections: [], lateArriving: 0 };
  const c = (k: string) => (q.counters[k] ??= { tested: 0, failed: 0 });
  const agentMap = new Map(agents.map((a) => [a.agentId, a]));
  const events = byTopic(bronze, "insurance.policies");
  c("policy_cdc_dedupe").tested = events.length;
  const latest = new Map<string, BronzeRow>();
  for (const e of events) {
    const id = String(e.payload.policy_id ?? "");
    const prev = latest.get(id);
    if (!prev || Number(e.payload.ts_ms ?? 0) >= Number(prev.payload.ts_ms ?? 0)) latest.set(id, e);
  }
  c("policy_cdc_dedupe").failed = events.length - latest.size;
  const rows: SilverPolicyRow[] = [];
  for (const e of latest.values()) {
    const p = e.payload as Record<string, unknown>;
    const county = resolveCounty(p.county);
    const premium = coerceNumber(p.annual_premium);
    const vc = c("premium_validity");
    vc.tested++;
    if (premium === null || premium <= 0) {
      vc.failed++;
      q.rejections.push({ reason: "annual_premium <= 0 or non-numeric — row quarantined", dataset: "silver_policy", count: 1, severity: "critical", example: String(p.policy_id) });
      continue;
    }
    const start = String(p.start_date ?? "");
    const end = String(p.end_date ?? "");
    const dc = c("policy_date_consistency");
    dc.tested++;
    if (!start || !end || end < start) dc.failed++;
    rows.push({
      policyKey: `POLK-${String(p.policy_id).replace("POL-", "")}`,
      policyId: String(p.policy_id),
      customerId: String(p.customer_id),
      product: String(p.product ?? "Unknown"),
      lob: String(p.lob ?? "Motor"),
      coverType: String(p.cover_type ?? "Standard"),
      agentId: String(p.agent_id),
      startDate: start,
      endDate: end,
      status: String(p.status ?? "Active"),
      annualPremium: premium,
      sumInsured: coerceNumber(p.sum_insured) ?? 0,
      excess: coerceNumber(p.excess) ?? 0,
      paymentFrequency: String(p.payment_frequency ?? "Annual"),
      countyCode: county.code,
      countyName: county.name,
      renewalCount: Number(p.renewal_count ?? 0),
      commissionRate: agentMap.get(String(p.agent_id))?.commissionRate ?? 0.1,
      validFrom: start,
      validTo: null,
      isCurrent: true,
      rowHash: hashRow(p),
    });
  }
  return { rows, q };
}

export type SilverClaimRow = {
  claimKey: string; claimId: string; policyId: string; customerId: string; providerId: string | null; agentId: string | null;
  vehicleReg: string | null; claimDate: string; reportDate: string; settleDate: string | null; claimType: string;
  cause: string; amountClaimed: number; amountPaid: number; reserveAmount: number; status: string; countyCode: string;
  countyName: string; reportingLagDays: number; dedupeScore: number; isDuplicate: boolean; isFraud: boolean;
  currency: string; qualityFlags: string[]; rowHash: string; ingestedAt: Date;
};

export function silverClaims(bronze: BronzeRow[], policyIds: Set<string>, customerIds: Set<string>, asOf: Date): { rows: SilverClaimRow[]; q: Quality; quarantined: BronzeRow[] } {
  const q: Quality = { counters: {}, rejections: [], lateArriving: 0 };
  const c = (k: string) => (q.counters[k] ??= { tested: 0, failed: 0 });
  const events = byTopic(bronze, "insurance.claims").sort((a, b) => a.eventTime.localeCompare(b.eventTime));
  c("claim_uniqueness").tested = events.length;
  const grouped = new Map<string, BronzeRow[]>();
  for (const e of events) {
    const id = String(e.payload.claim_id ?? "");
    const arr = grouped.get(id);
    if (arr) {
      arr.push(e);
      c("claim_uniqueness").failed++;
    } else grouped.set(id, [e]);
  }

  const rows: SilverClaimRow[] = [];
  const quarantined: BronzeRow[] = [];
  const asOfKey = dateKeyOf(asOf);
  const reject = (reason: string, severity: Rejection["severity"], e: BronzeRow) => {
    q.rejections.push({ reason, dataset: "silver_claim", count: 1, severity, example: String(e.payload.claim_id) });
    quarantined.push(e);
  };

  for (const [claimId, group] of grouped) {
    const e = group[group.length - 1];
    const p = e.payload as Record<string, unknown>;
    const flags: string[] = [];
    if (group.length > 1) flags.push(`duplicate_delivery_x${group.length}`);
    if (e.schemaVersion < 3) flags.push(`schema_v${e.schemaVersion}_upcast`);

    const amount = coerceNumber(p.claim_amount);
    const vc = c("claim_amount_validity");
    vc.tested++;
    if (amount === null || amount <= 0) {
      vc.failed++;
      reject(amount === null ? "claim_amount non-numeric / null" : "claim_amount negative — quarantine", amount === null ? "critical" : "critical", e);
      continue;
    }

    const claimDate = String(p.claim_date ?? "");
    const tc = c("claim_timeliness");
    tc.tested++;
    if (!claimDate || dateKeyOf(claimDate) > asOfKey) {
      tc.failed++;
      q.lateArriving++;
      reject("claim_date in the future (source clock skew)", "warning", e);
      continue;
    }

    const cc = c("claim_completeness");
    cc.tested++;
    const customerId = typeof p.customer_id === "string" ? p.customer_id : null;
    if (!customerId) {
      cc.failed++;
      reject("customer_id null — cannot resolve FK", "critical", e);
      continue;
    }

    const ri = c("referential_integrity");
    ri.tested++;
    const policyId = String(p.policy_id ?? "");
    if (!policyIds.has(policyId) || !customerIds.has(customerId)) {
      ri.failed++;
      reject("orphan policy_id/customer_id — referential integrity breach", "critical", e);
      continue;
    }

    const county = resolveCounty(p.location);
    const sc = c("county_standardisation");
    sc.tested++;
    if (!county.matched) sc.failed++;

    const rawType = String(p.claim_type ?? "Motor");
    const stdType = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();
    const stc = c("claim_type_validity");
    stc.tested++;
    if (stdType !== rawType) stc.failed++;

    const paid = Math.max(0, coerceNumber(p.amount_paid) ?? 0);
    const reserve = Math.max(0, coerceNumber(p.reserve) ?? 0);
    const lagRaw = coerceNumber(p.reporting_lag_days);
    const lag = lagRaw === null ? Math.max(0, Math.round((Date.parse(String(p.report_date ?? claimDate)) - Date.parse(claimDate)) / 86400000)) : lagRaw;
    const lagC = c("reporting_lag_accuracy");
    lagC.tested++;
    if (lag < 0 || lag > 365) lagC.failed++;

    rows.push({
      claimKey: `CLK-${claimId.replace("CLM-", "")}`,
      claimId,
      policyId,
      customerId,
      providerId: typeof p.provider_id === "string" ? p.provider_id : null,
      agentId: typeof p.agent_id === "string" ? p.agent_id : null,
      vehicleReg: typeof p.vehicle_reg === "string" ? p.vehicle_reg : null,
      claimDate,
      reportDate: String(p.report_date ?? claimDate),
      settleDate: typeof p.settle_date === "string" ? p.settle_date : null,
      claimType: stdType,
      cause: String(p.cause ?? "Unspecified"),
      amountClaimed: Math.round(amount),
      amountPaid: Math.round(paid),
      reserveAmount: Math.round(reserve),
      status: String(p.status ?? "Submitted"),
      countyCode: county.code,
      countyName: county.name,
      reportingLagDays: lag,
      dedupeScore: group.length > 1 ? Math.min(0.99, 0.55 + group.length * 0.12) : Math.min(0.4, lag > 180 ? 0.35 : 0.02),
      isDuplicate: group.length > 1,
      isFraud: false,
      currency: typeof p.currency === "string" ? p.currency : "KES",
      qualityFlags: flags,
      rowHash: hashRow(p),
      ingestedAt: new Date(e.eventTime.replace(" ", "T") + "Z"),
    });
  }

  if (q.rejections.length) {
    const summary = new Map<string, Rejection>();
    for (const r of q.rejections) {
      const existing = summary.get(r.reason);
      if (existing) existing.count += 1;
      else summary.set(r.reason, { ...r });
    }
    q.rejections = [...summary.values()];
  }
  return { rows, q, quarantined };
}

export type SilverPaymentRow = {
  paymentId: string; policyId: string; customerId: string; channel: string; mpesaReceipt: string | null; amount: number;
  currency: string; paidAt: Date; status: string; paymentType: string; countyCode: string; velocity30d: number; rowHash: string;
};

export function silverPayments(bronze: BronzeRow[], policyIds: Set<string>): { rows: SilverPaymentRow[]; q: Quality } {
  const q: Quality = { counters: {}, rejections: [], lateArriving: 0 };
  const c = (k: string) => (q.counters[k] ??= { tested: 0, failed: 0 });
  const events = [...byTopic(bronze, "insurance.payments"), ...byTopic(bronze, "insurance.mpesa")];
  c("payment_uniqueness").tested = events.length;
  const latest = new Map<string, BronzeRow>();
  for (const e of events) {
    const id = String(e.payload.payment_id ?? "");
    if (latest.has(id)) c("payment_uniqueness").failed++;
    latest.set(id, e);
  }
  const rows: SilverPaymentRow[] = [];
  const perCustomer: Record<string, number[]> = {};
  for (const e of latest.values()) {
    const p = e.payload as Record<string, unknown>;
    const amount = coerceNumber(p.amount);
    const vc = c("payment_amount_validity");
    vc.tested++;
    if (amount === null || amount <= 0) {
      vc.failed++;
      q.rejections.push({ reason: "amount invalid", dataset: "silver_payment", count: 1, severity: "critical", example: String(p.payment_id) });
      continue;
    }
    if (!policyIds.has(String(p.policy_id))) {
      const ri = c("payment_referential_integrity");
      ri.tested++;
      ri.failed++;
      continue;
    }
    const county = resolveCounty(p.county);
    const receipt = typeof p.mpesa_receipt === "string" ? p.mpesa_receipt : null;
    const rc = c("mpesa_receipt_validity");
    if (receipt) {
      rc.tested++;
      if (!/^[A-Z]{3}\d{6}$/.test(receipt)) rc.failed++;
    }
    const paidAt = new Date(String(p.paid_at).replace(" ", "T") + "Z");
    const custId = String(p.customer_id);
    (perCustomer[custId] ??= []).push(paidAt.getTime());
    rows.push({
      paymentId: String(p.payment_id),
      policyId: String(p.policy_id),
      customerId: custId,
      channel: String(p.channel ?? "M-PESA"),
      mpesaReceipt: receipt,
      amount: Math.round(amount),
      currency: typeof p.currency === "string" ? p.currency : "KES",
      paidAt,
      status: String(p.status ?? "Successful"),
      paymentType: String(p.payment_type ?? "Premium"),
      countyCode: county.code,
      velocity30d: 0,
      rowHash: hashRow(p),
    });
  }
  for (const row of rows) {
    const times = perCustomer[row.customerId] ?? [];
    row.velocity30d = times.filter((t) => t <= row.paidAt.getTime() && t > row.paidAt.getTime() - 30 * 86400000).length;
  }
  if (q.rejections.length) {
    const first = q.rejections[0];
    q.rejections = [{ ...first, count: q.rejections.length }];
  }
  return { rows, q };
}

export function silverTelematics(events: SrcTelematics[]): { rows: Array<ReturnType<typeof row>>; q: Quality } {
  const q: Quality = { counters: {}, rejections: [], lateArriving: 0 };
  const c = (k: string) => (q.counters[k] ??= { tested: 0, failed: 0 });
  const row = (t: SrcTelematics, speed: number, battery: number) => ({
    eventId: t.eventId,
    vehicleReg: t.vehicleReg,
    customerId: t.customerId,
    deviceId: t.deviceId,
    occurredAt: new Date(t.occurredAt.replace(" ", "T") + "Z"),
    speedKmh: speed,
    harshBraking: t.harshBraking,
    harshAcceleration: t.harshAcceleration,
    nightDrivingKm: t.nightDrivingKm,
    distanceKm: t.distanceKm,
    countyCode: t.countyCode,
    batteryPct: battery,
    rowHash: hashRow(t),
  });
  const rows = events.map((t) => {
    const sc = c("telematics_range");
    sc.tested++;
    let speed = t.speedKmh;
    let battery = t.batteryPct;
    if (speed < 0 || speed > 220 || battery < 0 || battery > 100) {
      sc.failed++;
      speed = Math.min(220, Math.max(0, speed));
      battery = Math.min(100, Math.max(0, battery));
    }
    return row(t, speed, battery);
  });
  return { rows, q };
}

export function providerRows(providers: SrcProvider[]): Array<{
  providerKey: string; providerId: string; name: string; providerType: string; countyCode: string; countyName: string;
  accreditation: string; licenceStatus: string; claimVolume: number; avgClaimAmount: number; rejectionRate: number;
  networkDegree: number; providerRiskScore: number; rowHash: string;
}> {
  return providers.map((p) => ({
    providerKey: `PRVK-${p.providerId.replace("PRV-", "")}`,
    providerId: p.providerId,
    name: p.name,
    providerType: p.providerType,
    countyCode: p.countyCode,
    countyName: p.countyName,
    accreditation: p.accreditation,
    licenceStatus: p.licenceStatus,
    claimVolume: p.claimVolume,
    avgClaimAmount: Math.round(p.avgClaimAmount),
    rejectionRate: Number(p.rejectionRate.toFixed(4)),
    networkDegree: p.networkDegree,
    providerRiskScore: Number(p.providerRiskScore.toFixed(4)),
    rowHash: hashRow(p),
  }));
}

export function agentRows(agents: SrcAgent[]) {
  return agents.map((a) => ({
    agentKey: `AGTK-${a.agentId.replace("AGT-", "")}`,
    agentId: a.agentId,
    name: a.name,
    branch: a.branch,
    channel: a.channel,
    countyCode: a.countyCode,
    policiesSold: a.policiesSold,
    persistencyRate: Number(a.persistencyRate.toFixed(4)),
    commissionRate: Number(a.commissionRate.toFixed(4)),
    status: a.status,
    rowHash: hashRow(a),
  }));
}

export function vehicleRows(vehicles: SrcVehicle[]) {
  return vehicles.map((v) => ({
    vehicleKey: `VEHK-${v.registration}`,
    registration: v.registration,
    customerId: v.customerId,
    make: v.make,
    model: v.model,
    yearOfManufacture: v.yearOfManufacture,
    bodyType: v.bodyType,
    engineCc: v.engineCc,
    marketValue: v.marketValue,
    usage: v.usage,
    telematicsDeviceId: v.telematicsDeviceId ?? null,
    countyCode: v.countyCode,
    countyName: COUNTIES.find((c) => c.code === v.countyCode)?.name ?? "Nairobi",
    ntsaStatus: v.ntsaStatus,
    rowHash: hashRow(v),
  }));
}

export function mergeQuality(list: Quality[]): Quality {
  const out: Quality = { counters: {}, rejections: [], lateArriving: 0 };
  for (const q of list) {
    for (const [k, v] of Object.entries(q.counters)) {
      const cur = (out.counters[k] ??= { tested: 0, failed: 0 });
      cur.tested += v.tested;
      cur.failed += v.failed;
    }
    out.rejections.push(...q.rejections);
    out.lateArriving += q.lateArriving;
  }
  return out;
}

export function universeStats(u: Universe) {
  return u.counts;
}
