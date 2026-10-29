/**
 * INSURELAKE — synthetic Kenyan insurance data generator.
 *
 * Produces a *source-of-truth* universe (customers, policies, claims, payments,
 * vehicles, providers, agents, telematics) and the raw Bronze payloads exactly
 * as they would land from Kafka / S3, including the kind of defects a real
 * lakehouse must survive: nulls, string-typed amounts, duplicates, future
 * dates, inconsistent phone formats, rogue providers, fraud rings and
 * schema-version evolution (v1 → v2 → v3).
 */
import {
  BODY_TYPES,
  CAUSES,
  CHANNELS,
  COUNTIES,
  FIRST_NAMES,
  GARAGE_PREFIX,
  GARAGE_SUFFIX,
  HOSPITAL_PREFIX,
  HOSPITAL_SUFFIX,
  INCOME_BANDS,
  LAST_NAMES,
  LOBS,
  OCCUPATIONS,
  PAYMENT_CHANNELS,
  USAGES,
  VEHICLE_MAKES,
  type County,
} from "./kenya";

export type Rng = {
  next: () => number;
  int: (n: number) => number;
  range: (a: number, b: number) => number;
  gauss: (mu: number, sigma: number) => number;
  lognormal: (mu: number, sigma: number) => number;
  chance: (p: number) => boolean;
  pick: <T>(arr: readonly T[]) => T;
  weighted: <T>(items: readonly T[], weights: readonly number[]) => T;
};

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const range = (x: number, y: number) => x + next() * (y - x);
  const gauss = (mu: number, sigma: number) => {
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const lognormal = (mu: number, sigma: number) => Math.exp(gauss(mu, sigma));
  const chance = (p: number) => next() < p;
  const pick = <T,>(arr: readonly T[]): T => arr[int(arr.length)];
  const weighted = <T,>(items: readonly T[], weights: readonly number[]): T => {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };
  return { next, int, range, gauss, lognormal, chance, pick, weighted };
}

/* ------------------------------------------------------------------ */

export type SrcProvider = {
  providerId: string;
  name: string;
  providerType: "Hospital" | "Garage" | "Clinic" | "Pharmacy" | "Assessor";
  countyCode: string;
  countyName: string;
  accreditation: string;
  licenceStatus: string;
  claimVolume: number;
  avgClaimAmount: number;
  rejectionRate: number;
  networkDegree: number;
  providerRiskScore: number;
  rogue: boolean;
};

export type SrcAgent = {
  agentId: string;
  name: string;
  branch: string;
  channel: string;
  countyCode: string;
  policiesSold: number;
  persistencyRate: number;
  commissionRate: number;
  status: string;
};

export type SrcCustomer = {
  customerId: string;
  fullName: string;
  nationalId: string;
  phone: string;
  gender: "M" | "F";
  birthDate: string;
  ageBand: string;
  countyCode: string;
  subCounty: string;
  ward: string;
  occupation: string;
  incomeBand: string;
  kycStatus: string;
  channel: string;
  riskProfile: number;
  fraudster: boolean;
  churnRisk: number;
};

export type SrcPolicy = {
  policyId: string;
  customerId: string;
  lob: string;
  product: string;
  coverType: string;
  agentId: string;
  startDate: string;
  endDate: string;
  status: string;
  annualPremium: number;
  sumInsured: number;
  excess: number;
  paymentFrequency: string;
  countyCode: string;
  renewalCount: number;
  commissionRate: number;
  vehicleReg?: string;
};

export type SrcVehicle = {
  registration: string;
  customerId: string;
  make: string;
  model: string;
  yearOfManufacture: number;
  bodyType: string;
  engineCc: number;
  marketValue: number;
  usage: string;
  telematicsDeviceId?: string;
  countyCode: string;
  ntsaStatus: string;
};

export type SrcClaim = {
  claimId: string;
  policyId: string;
  customerId: string;
  providerId?: string;
  agentId: string;
  vehicleReg?: string;
  claimDate: string;
  reportDate: string;
  settleDate?: string;
  claimType: string;
  cause: string;
  amountClaimed: number;
  amountPaid: number;
  reserveAmount: number;
  status: string;
  countyCode: string;
  reportingLagDays: number;
  isFraud: boolean;
  fraudRingId?: string;
};

export type SrcPayment = {
  paymentId: string;
  policyId: string;
  customerId: string;
  channel: string;
  mpesaReceipt?: string;
  amount: number;
  paidAt: string;
  status: string;
  paymentType: string;
  countyCode: string;
};

export type SrcTelematics = {
  eventId: string;
  vehicleReg: string;
  customerId: string;
  deviceId: string;
  occurredAt: string;
  speedKmh: number;
  harshBraking: number;
  harshAcceleration: number;
  nightDrivingKm: number;
  distanceKm: number;
  countyCode: string;
  batteryPct: number;
};

export type BronzeRow = {
  eventId: string;
  topic: string;
  sourceSystem: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  eventTime: string;
  lakePath: string;
  partition: string;
  batchId: string;
  offset: number;
  ingestMode: string;
  payloadBytes: number;
};

export type ScdEvent = {
  id: string;
  tableName: string;
  strategy: "SCD Type 1" | "SCD Type 2";
  entityKey: string;
  entityLabel: string;
  attribute: string;
  oldValue: string | null;
  newValue: string;
  changedAt: string;
  changedBy: string;
  validFrom: string;
  validTo: string | null;
};

export type Universe = {
  asOf: Date;
  start: Date;
  providers: SrcProvider[];
  agents: SrcAgent[];
  customers: SrcCustomer[];
  vehicles: SrcVehicle[];
  policies: SrcPolicy[];
  claims: SrcClaim[];
  payments: SrcPayment[];
  telematics: SrcTelematics[];
  bronze: BronzeRow[];
  scdEvents: ScdEvent[];
  fraudRings: { ringId: string; providerId?: string; memberCount: number; amount: number; claimIds: string[] }[];
  counts: Record<string, number>;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const isoTs = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const pad = (n: number, w = 4) => String(n).padStart(w, "0");

export function countyOf(code: string): County {
  return COUNTIES.find((c) => c.code === code) ?? COUNTIES[46];
}

function phoneFor(r: Rng, code: string): string {
  const prefixes = ["712", "722", "733", "740", "755", "768", "790", "701", "715", "726"];
  const p = r.pick(prefixes);
  const tail = String(r.int(1000000)).padStart(6, "0");
  const styles = [`+254${p}${tail}`, `0${p}${tail}`, `${p}${tail}`, `254${p}${tail}`];
  void code;
  return r.weighted(styles, [0.45, 0.3, 0.18, 0.07]);
}

function mpesaReceipt(r: Rng): string {
  const letters = "QWERTYUOPASDFGHJKLZXCVBNM";
  let s = "";
  for (let i = 0; i < 3; i++) s += letters[r.int(letters.length)];
  return `${s}${r.int(900000) + 100000}`;
}

function regPlate(r: Rng, seq: number): string {
  const letters = "KABCDEFGHJKLMNPRSTUVWXYZ";
  const series = letters[Math.floor(seq / (9999 * letters.length)) % letters.length] ?? letters[r.int(letters.length)];
  const num = String(1000 + (seq % 8999));
  const suffix = letters[Math.floor(seq / 8999) % letters.length];
  return `K${series}${num}${suffix}`;
}

export function generateUniverse(seed = 20260929): Universe {
  const r = rng(seed);
  const asOf = new Date();
  asOf.setHours(9, 0, 0, 0);
  const start = new Date(asOf);
  start.setFullYear(start.getFullYear() - 3);

  const countyWeights = COUNTIES.map((c) => Math.pow(c.population / 1_000_000, 0.85) * (0.6 + c.gdpIndex * 0.8));
  const pickCounty = () => r.weighted(COUNTIES, countyWeights);
  const lobKeys = LOBS.map((l) => l.key);
  const lobWeights = LOBS.map((l) => l.weight);

  /* ---------------- providers ---------------- */
  const providers: SrcProvider[] = [];
  const PROVIDER_N = 420;
  for (let i = 0; i < PROVIDER_N; i++) {
    const c = pickCounty();
    const isHospital = i % 3 !== 2;
    const name = isHospital
      ? `${r.pick(HOSPITAL_PREFIX)} ${r.pick(HOSPITAL_SUFFIX)}`
      : `${r.pick(GARAGE_PREFIX)} ${r.pick(GARAGE_SUFFIX)}`;
    const rogue = r.chance(0.035);
    providers.push({
      providerId: `PRV-${pad(i + 1)}`,
      name: `${name}${c.name === "Nairobi" && i % 7 === 0 ? " — " + r.pick(c.subCounties) : ""}`,
      providerType: isHospital ? (r.chance(0.25) ? "Clinic" : "Hospital") : "Garage",
      countyCode: c.code,
      countyName: c.name,
      accreditation: isHospital ? r.pick(["NHIF/SHA Empanelled", "Private Insurer Panel", "Not Empanelled"]) : r.pick(["AAIS Approved", "Insurance Surveyors Panel", "Provisional"]),
      licenceStatus: rogue && r.chance(0.3) ? "Suspended" : r.chance(0.94) ? "Active" : "Under Review",
      claimVolume: 0,
      avgClaimAmount: 0,
      rejectionRate: rogue ? r.range(0.22, 0.55) : r.range(0.01, 0.12),
      networkDegree: 0,
      providerRiskScore: 0,
      rogue,
    });
  }

  /* ---------------- agents ---------------- */
  const agents: SrcAgent[] = [];
  for (let i = 0; i < 300; i++) {
    const c = pickCounty();
    agents.push({
      agentId: `AGT-${pad(i + 1, 3)}`,
      name: `${r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`,
      branch: `${c.name} Branch`,
      channel: r.pick(["Direct Agent", "Broker", "Bancassurance", "Digital", "Sacco channel"]),
      countyCode: c.code,
      policiesSold: 0,
      persistencyRate: r.range(0.62, 0.97),
      commissionRate: r.range(0.05, 0.22),
      status: r.chance(0.93) ? "Active" : "Terminated",
    });
  }

  /* ---------------- customers ---------------- */
  const customers: SrcCustomer[] = [];
  const CUSTOMER_N = 9000;
  for (let i = 0; i < CUSTOMER_N; i++) {
    const c = pickCounty();
    const gender: "M" | "F" = r.chance(0.52) ? "M" : "F";
    const age = Math.floor(r.range(19, 78));
    const fraudster = r.chance(0.058);
    customers.push({
      customerId: `CUS-${pad(i + 1)}`,
      fullName: `${gender === "M" ? r.pick(FIRST_NAMES) : r.pick(FIRST_NAMES)} ${r.pick(LAST_NAMES)}`,
      nationalId: String(r.int(45_000_000) + 5_000_000),
      phone: phoneFor(r, c.code),
      gender,
      birthDate: iso(new Date(asOf.getFullYear() - age, r.int(12), r.int(27) + 1)),
      ageBand: age < 26 ? "18-25" : age < 36 ? "26-35" : age < 46 ? "36-45" : age < 56 ? "46-55" : age < 66 ? "56-65" : "65+",
      countyCode: c.code,
      subCounty: r.pick(c.subCounties),
      ward: `Ward ${r.int(60) + 1}`,
      occupation: r.pick(OCCUPATIONS),
      incomeBand: r.pick(INCOME_BANDS),
      kycStatus: r.chance(0.93) ? "Verified" : r.chance(0.5) ? "Pending" : "Rejected",
      channel: r.pick(CHANNELS),
      riskProfile: r.range(0.15, 0.95) + (fraudster ? 0.25 : 0),
      fraudster,
      churnRisk: 0,
    });
  }
  // entity-resolution defects: duplicated national IDs (same human, two records)
  for (let i = 0; i < 70; i++) {
    const a = customers[r.int(customers.length)];
    const b = customers[r.int(customers.length)];
    if (a.customerId !== b.customerId) b.nationalId = a.nationalId;
  }

  /* ---------------- vehicles ---------------- */
  const vehicles: SrcVehicle[] = [];
  const makeNames = Object.keys(VEHICLE_MAKES);
  const makeWeights = makeNames.map((m) => VEHICLE_MAKES[m].weight);
  const VEHICLE_N = 6500;
  for (let i = 0; i < VEHICLE_N; i++) {
    const cust = customers[r.int(customers.length)];
    const make = r.weighted(makeNames, makeWeights);
    const model = r.pick(VEHICLE_MAKES[make].models);
    const year = Math.floor(r.range(2001, asOf.getFullYear() + 1));
    const usage = r.pick(USAGES);
    vehicles.push({
      registration: regPlate(r, i),
      customerId: cust.customerId,
      make,
      model,
      yearOfManufacture: year,
      bodyType: make === "Boda" ? "Motorcycle" : r.pick(BODY_TYPES),
      engineCc: make === "Boda" ? r.int(60) + 100 : r.int(2600) + 1000,
      marketValue: Math.round(r.lognormal(13.2, 0.6) / 1000) * 1000,
      usage,
      telematicsDeviceId: r.chance(0.34) ? `TEL-${pad(i + 1, 5)}` : undefined,
      countyCode: cust.countyCode,
      ntsaStatus: r.chance(0.86) ? "Inspection Valid" : r.chance(0.5) ? "Expired Inspection" : "Not Registered in NTSA",
    });
  }
  const vehiclesByCustomer = new Map<string, SrcVehicle[]>();
  for (const v of vehicles) {
    const list = vehiclesByCustomer.get(v.customerId) ?? [];
    list.push(v);
    vehiclesByCustomer.set(v.customerId, list);
  }

  /* ---------------- policies ---------------- */
  const policies: SrcPolicy[] = [];
  const POLICY_N = 15000;
  for (let i = 0; i < POLICY_N; i++) {
    const cust = customers[r.int(customers.length)];
    const lob = r.weighted(lobKeys, lobWeights);
    const lobCfg = LOBS.find((l) => l.key === lob)!;
    const agent = agents[r.int(agents.length)];
    agent.policiesSold++;
    const startOffset = Math.floor(r.range(0, 1000));
    const sDate = addDays(start, startOffset);
    const tenureYears = Math.min(3, (asOf.getTime() - sDate.getTime()) / (365 * 86400000));
    const risk = countyOf(cust.countyCode);
    const premiumBase =
      lobCfg.basePremium *
      (0.55 + cust.riskProfile * 0.9) *
      (0.8 + risk.roadRisk * 0.5) *
      (cust.ageBand === "18-25" ? 1.32 : cust.ageBand === "65+" ? 1.18 : 1) *
      (1 + tenureYears * 0.04);
    const veh = lob === "Motor" ? (vehiclesByCustomer.get(cust.customerId) ?? [])[r.int(Math.max(1, (vehiclesByCustomer.get(cust.customerId) ?? []).length))] : undefined;
    const sumInsured = lob === "Motor" ? (veh?.marketValue ?? r.lognormal(13.3, 0.55)) : lob === "Health" ? r.range(300000, 5_000_000) : lob === "Life" ? r.range(500000, 12_000_000) : lob === "Micro" ? r.range(20000, 250000) : r.range(100000, 1500000);
    const cancelled = r.chance(0.11) && tenureYears > 0.3;
    const lapsed = !cancelled && r.chance(0.09);
    policies.push({
      policyId: `POL-${pad(i + 1, 5)}`,
      customerId: cust.customerId,
      lob,
      product: lobCfg.product,
      coverType: lob === "Motor" ? r.pick(["Comprehensive", "Third Party Only", "Third Party Fire & Theft", "PSV Comprehensive"]) : lob === "Health" ? r.pick(["Inpatient only", "IP + OP", "Family cover", "Maternity rider"]) : lob === "Life" ? r.pick(["Term life", "Whole life", "Education endowment", "PA rider"]) : lob === "Micro" ? r.pick(["Funeral", "Index crop", "Livestock", "Hospital cash"]) : r.pick(["Index drought", "Livestock mortality"]),
      agentId: agent.agentId,
      startDate: iso(sDate),
      endDate: iso(addDays(sDate, 365)),
      status: cancelled ? "Cancelled" : lapsed ? "Lapsed" : sDate > asOf ? "Pending" : "Active",
      annualPremium: Math.round(premiumBase / 100) * 100,
      sumInsured: Math.round(sumInsured / 1000) * 1000,
      excess: Math.round((sumInsured * r.range(0.01, 0.05)) / 500) * 500,
      paymentFrequency: r.pick(["Monthly (M-PESA)", "Quarterly", "Semi-annual", "Annual"]),
      countyCode: cust.countyCode,
      renewalCount: Math.max(0, Math.floor(tenureYears) - (r.chance(0.3) ? 1 : 0)),
      commissionRate: agent.commissionRate,
      vehicleReg: veh?.registration,
    });
  }
  const activePolicies = policies.filter((p) => p.status === "Active" || p.status === "Lapsed");

  /* ---------------- fraud rings ---------------- */
  const rings: Universe["fraudRings"] = [];
  const rogueProviders = providers.filter((p) => p.rogue);
  for (let k = 0; k < 9; k++) {
    const prov = rogueProviders[k % rogueProviders.length];
    rings.push({ ringId: `RING-${pad(k + 1, 2)}`, providerId: prov?.providerId, memberCount: r.int(6) + 4, amount: 0, claimIds: [] });
  }

  /* ---------------- claims ---------------- */
  const claims: SrcClaim[] = [];
  const CLAIM_N = 9200;
  const byProvider = new Map<string, number>();
  const byCustomer = new Map<string, number>();
  for (let i = 0; i < CLAIM_N; i++) {
    const policy = activePolicies[r.int(activePolicies.length)];
    const cust = customers.find((c) => c.customerId === policy.customerId) ?? customers[0];
    const risk = countyOf(policy.countyCode);
    const startD = new Date(policy.startDate);
    const windowDays = Math.max(20, (asOf.getTime() - startD.getTime()) / 86400000);
    const claimDate = addDays(startD, Math.floor(r.range(15, windowDays)));
    if (claimDate > asOf) continue;

    const isFraud = cust.fraudster && r.chance(0.72);
    const ring = isFraud && r.chance(0.55) ? rings[r.int(rings.length)] : undefined;
    const providerTypeNeeded = policy.lob === "Motor" || policy.lob === "Agriculture" ? "Garage" : "Hospital";
    const pool = providers.filter(
      (p) => (providerTypeNeeded === "Garage" ? p.providerType === "Garage" : p.providerType !== "Garage") && (ring ? p.providerId === ring.providerId : true),
    );
    const provider = pool.length ? pool[r.int(pool.length)] : undefined;

    const cause = r.pick(CAUSES[policy.lob] ?? CAUSES.Motor);
    const severity = policy.lob === "Motor" ? policy.sumInsured * r.lognormal(-2.4, 0.85) : policy.lob === "Health" ? r.lognormal(10.6, 1.0) : policy.lob === "Life" ? r.lognormal(12.4, 0.9) : policy.lob === "Micro" ? r.lognormal(8.6, 0.7) : r.lognormal(10.1, 0.8);
    let amount = Math.max(1500, Math.round(severity / 500) * 500);
    if (isFraud) amount = Math.round((amount * r.range(2.1, 5.4)) / 500) * 500;

    const lobCfg = LOBS.find((l) => l.key === policy.lob)!;
    const lag = Math.max(0, Math.round(r.lognormal(1.4, 0.9) * (isFraud ? 0.6 : 1)));
    const reportDate = addDays(claimDate, lag);
    const settleMonths = Math.max(0.15, r.lognormal(Math.log(2.3 / lobCfg.devSpeed), 0.72));
    const settleDate = new Date(claimDate.getTime() + settleMonths * 30.4 * 86400000);
    const settled = settleDate <= asOf;
    const rejected = settled && r.chance(0.055);
    const excessApplied = r.chance(0.6) ? policy.excess : 0;
    const paid = rejected ? 0 : Math.max(0, Math.round((amount * r.range(0.78, 0.99) - excessApplied) / 500) * 500);
    const status = rejected ? "Rejected" : settled ? (r.chance(0.12) ? "Closed - Settled" : "Paid") : reportDate > asOf ? "Submitted" : r.chance(0.55) ? "Under Assessment" : "Awaiting Documents";

    const claim: SrcClaim = {
      claimId: `CLM-${pad(100000 + i, 6)}`,
      policyId: policy.policyId,
      customerId: policy.customerId,
      providerId: provider?.providerId,
      agentId: policy.agentId,
      vehicleReg: policy.vehicleReg,
      claimDate: iso(claimDate),
      reportDate: iso(reportDate > asOf ? claimDate : reportDate),
      settleDate: settled ? iso(settleDate) : undefined,
      claimType: policy.lob,
      cause,
      amountClaimed: amount,
      amountPaid: Math.max(0, paid),
      reserveAmount: settled ? 0 : Math.max(0, amount - Math.max(0, paid) * (settled ? 1 : 0.55)),
      status,
      countyCode: policy.countyCode,
      reportingLagDays: lag,
      isFraud,
      fraudRingId: ring?.ringId,
    };
    claims.push(claim);
    if (provider) byProvider.set(provider.providerId, (byProvider.get(provider.providerId) ?? 0) + 1);
    byCustomer.set(policy.customerId, (byCustomer.get(policy.customerId) ?? 0) + 1);
    if (ring) {
      ring.claimIds.push(claim.claimId);
      ring.amount += amount;
    }
    void risk;
  }

  for (const p of providers) {
    const vol = byProvider.get(p.providerId) ?? 0;
    p.claimVolume = vol;
    p.avgClaimAmount = vol ? claims.filter((c) => c.providerId === p.providerId).reduce((s, c) => s + c.amountClaimed, 0) / vol : 0;
    p.networkDegree = Math.min(38, Math.round(vol / 14) + (p.rogue ? 6 : 0));
    p.providerRiskScore = Math.min(0.99, 0.18 + (p.rogue ? 0.5 : 0) + p.rejectionRate * 0.5 + Math.min(0.18, vol / 900));
  }
  for (const c of customers) {
    const cc = byCustomer.get(c.customerId) ?? 0;
    c.churnRisk = Math.min(0.97, 0.06 + (cc === 0 ? 0.22 : 0) + (c.kycStatus !== "Verified" ? 0.18 : 0) + (c.fraudster ? 0.1 : 0) + r.range(0, 0.22));
  }

  /* ---------------- payments ---------------- */
  const payments: SrcPayment[] = [];
  const PAY_N = 21000;
  for (let i = 0; i < PAY_N; i++) {
    const policy = policies[r.int(policies.length)];
    const cust = customers.find((c) => c.customerId === policy.customerId) ?? customers[0];
    const freqDiv = policy.paymentFrequency.startsWith("Monthly") ? 12 : policy.paymentFrequency === "Quarterly" ? 4 : policy.paymentFrequency === "Semi-annual" ? 2 : 1;
    const sDate = new Date(policy.startDate);
    const idx = r.int(freqDiv);
    const paidAt = addDays(sDate, Math.floor((idx * 365) / freqDiv) + r.int(6));
    if (paidAt > asOf) continue;
    const isMpesa = r.chance(0.71);
    const channel = isMpesa ? (r.chance(0.08) ? "M-PESA Global" : "M-PESA") : r.pick(PAYMENT_CHANNELS.filter((c) => !c.startsWith("M-PESA")));
    const failed = r.chance(0.06);
    payments.push({
      paymentId: `PAY-${pad(i + 1, 6)}`,
      policyId: policy.policyId,
      customerId: policy.customerId,
      channel,
      mpesaReceipt: channel.startsWith("M-PESA") ? mpesaReceipt(r) : undefined,
      amount: Math.max(300, Math.round(policy.annualPremium / freqDiv / 10) * 10),
      paidAt: isoTs(paidAt),
      status: failed ? (r.chance(0.5) ? "Failed" : "Reversed") : "Successful",
      paymentType: r.chance(0.86) ? "Premium" : r.chance(0.5) ? "Renewal" : "Claim settlement",
      countyCode: policy.countyCode,
    });
  }

  /* ---------------- telematics ---------------- */
  const telematics: SrcTelematics[] = [];
  const tracked = vehicles.filter((v) => v.telematicsDeviceId);
  const TEL_N = 13000;
  for (let i = 0; i < TEL_N; i++) {
    const v = tracked[r.int(tracked.length)];
    const when = new Date(asOf.getTime() - r.range(0, 720) * 86400000);
    when.setHours(r.int(24), r.int(60), 0, 0);
    const night = when.getHours() >= 22 || when.getHours() <= 5;
    const speed = Math.max(0, r.gauss(night ? 78 : 52, 22));
    telematics.push({
      eventId: `TEV-${pad(i + 1, 6)}`,
      vehicleReg: v.registration,
      customerId: v.customerId,
      deviceId: v.telematicsDeviceId!,
      occurredAt: isoTs(when),
      speedKmh: Math.round(speed * 10) / 10,
      harshBraking: r.chance(0.09 + speed / 900) ? r.int(3) + 1 : 0,
      harshAcceleration: r.chance(0.07 + speed / 1000) ? r.int(3) + 1 : 0,
      nightDrivingKm: night ? Math.round(r.range(4, 90) * 10) / 10 : 0,
      distanceKm: Math.round(r.range(2, 240) * 10) / 10,
      countyCode: v.countyCode,
      batteryPct: Math.round(r.range(12, 100) * 10) / 10,
    });
  }

  /* ---------------- bronze payloads ---------------- */
  const bronze: BronzeRow[] = [];
  const offsets: Record<string, number> = {};
  const push = (topic: string, sourceSystem: string, eventTime: string, payload: Record<string, unknown>, schemaVersion: number, ingestMode: string) => {
    offsets[topic] = (offsets[topic] ?? 40000) + 1;
    const d = new Date(eventTime.replace(" ", "T") + "Z");
    const part = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1, 2)}/${pad(d.getUTCDate(), 2)}`;
    const body = JSON.stringify(payload);
    bronze.push({
      eventId: `${topic.split(".")[1].toUpperCase()}-${pad(offsets[topic], 8)}`,
      topic,
      sourceSystem,
      schemaVersion,
      payload,
      eventTime: isoTs(d),
      lakePath: `s3a://insurelake/bronze/${topic.replace("insurance.", "")}/dt=${part}/${topic}-${pad(offsets[topic], 8)}.json`,
      partition: `dt=${part}`,
      batchId: `batch_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}_${topic.split(".")[1]}`,
      offset: offsets[topic],
      ingestMode,
      payloadBytes: body.length,
    });
  };

  const schemaVersionFor = (d: Date) => {
    const ageDays = (asOf.getTime() - d.getTime()) / 86400000;
    if (ageDays > 420) return 1;
    if (ageDays > 150) return 2;
    return 3;
  };

  for (const c of claims) {
    const d = new Date(c.claimDate);
    const v = schemaVersionFor(d);
    const payload: Record<string, unknown> = {
      claim_id: c.claimId,
      policy_id: c.policyId,
      customer_id: r.chance(0.012) ? null : c.customerId,
      claim_date: r.chance(0.006) ? iso(addDays(asOf, r.int(20) + 2)) : c.claimDate,
      claim_amount: r.chance(0.011) ? String(c.amountClaimed) : r.chance(0.004) ? -c.amountClaimed : c.amountClaimed,
      claim_type: r.chance(0.014) ? c.claimType.toUpperCase() : c.claimType,
      location: countyOf(c.countyCode).name,
      status: c.status,
      cause: c.cause,
      report_date: c.reportDate,
      amount_paid: c.amountPaid,
      reserve: c.reserveAmount,
      settle_date: c.settleDate ?? null,
      provider_id: c.providerId ?? null,
      agent_id: c.agentId,
      vehicle_reg: c.vehicleReg ?? null,
      reporting_lag_days: c.reportingLagDays,
    };
    if (v >= 2) payload.currency = "KES";
    if (v >= 3) {
      payload.fraud_score = null;
      payload.channel_of_report = r.pick(["Mobile app", "USSD *310#", "Call centre", "Branch", "WhatsApp"]);
    }
    push("insurance.claims", "policy-admin-core", `${c.claimDate} 10:12:00`, payload, v, "streaming");
    if (r.chance(0.007)) push("insurance.claims", "policy-admin-core", `${c.reportDate} 14:31:00`, payload, v, "streaming"); // duplicate re-delivery
  }

  for (const p of payments) {
    const d = new Date(p.paidAt.replace(" ", "T") + "Z");
    const v = schemaVersionFor(d);
    const payload: Record<string, unknown> = {
      payment_id: p.paymentId,
      policy_id: p.policyId,
      customer_id: p.customerId,
      amount: p.amount,
      channel: p.channel,
      paid_at: p.paidAt,
      status: p.status,
      payment_type: p.paymentType,
      county: countyOf(p.countyCode).name,
    };
    if (p.mpesaReceipt) {
      payload.mpesa_receipt = p.mpesaReceipt;
      payload.msisdn = r.chance(0.02) ? "REDACTED" : phoneFor(r, p.countyCode);
    }
    if (v >= 2) payload.currency = "KES";
    push(p.channel.startsWith("M-PESA") ? "insurance.mpesa" : "insurance.payments", p.channel.startsWith("M-PESA") ? "daraja-api" : "payments-core", p.paidAt, payload, v, "streaming");
  }

  for (const p of policies) {
    const v = schemaVersionFor(new Date(p.startDate));
    const payload: Record<string, unknown> = {
      policy_id: p.policyId,
      customer_id: p.customerId,
      product: p.product,
      lob: p.lob,
      cover_type: p.coverType,
      agent_id: p.agentId,
      start_date: p.startDate,
      end_date: p.endDate,
      status: p.status,
      annual_premium: p.annualPremium,
      sum_insured: p.sumInsured,
      excess: p.excess,
      payment_frequency: p.paymentFrequency,
      county: countyOf(p.countyCode).name,
      renewal_count: p.renewalCount,
      vehicle_reg: p.vehicleReg ?? null,
      op_type: r.chance(0.14) ? "u" : "c",
      ts_ms: Date.parse(p.startDate),
    };
    if (v >= 2) payload.currency = "KES";
    push("insurance.policies", "debezium-cdc-sap-fs", `${p.startDate} 08:05:00`, payload, v, r.chance(0.14) ? "cdc" : "batch");
  }

  for (const t of telematics) {
    push("insurance.telematics", "iot-gateway-mqtt", t.occurredAt, {
      event_id: t.eventId,
      device_id: t.deviceId,
      vehicle_reg: t.vehicleReg,
      customer_id: t.customerId,
      occurred_at: t.occurredAt,
      speed_kmh: t.speedKmh,
      harsh_braking: t.harshBraking,
      harsh_acceleration: t.harshAcceleration,
      night_driving_km: t.nightDrivingKm,
      distance_km: t.distanceKm,
      county: countyOf(t.countyCode).name,
      battery_pct: t.batteryPct,
      ignition: "ON",
    }, 4, "streaming");
  }

  for (const c of customers) {
    const payload: Record<string, unknown> = {
      customer_id: c.customerId,
      full_name: r.chance(0.008) ? null : c.fullName,
      national_id: c.nationalId,
      phone: c.phone,
      gender: c.gender,
      birth_date: c.birthDate,
      county: countyOf(c.countyCode).name,
      sub_county: c.subCounty,
      ward: c.ward,
      occupation: c.occupation,
      income_band: c.incomeBand,
      kyc_status: c.kycStatus,
      channel: c.channel,
      updated_at: isoTs(addDays(start, r.int(1000))),
    };
    push("insurance.customers", "salesforce-cdc", payload.updated_at as string, payload, 2, "cdc");
  }

  /* ---------------- SCD change events ---------------- */
  const scdEvents: ScdEvent[] = [];
  const attributes = [
    { table: "silver_customer", attribute: "address_county", strategy: "SCD Type 2" as const },
    { table: "silver_customer", attribute: "risk_classification", strategy: "SCD Type 2" as const },
    { table: "silver_policy", attribute: "policy_status", strategy: "SCD Type 1" as const },
    { table: "silver_policy", attribute: "agent_assignment", strategy: "SCD Type 2" as const },
    { table: "silver_vehicle", attribute: "ownership", strategy: "SCD Type 2" as const },
    { table: "silver_customer", attribute: "phone_number", strategy: "SCD Type 1" as const },
  ];
  for (let i = 0; i < 460; i++) {
    const a = attributes[r.int(attributes.length)];
    const isCust = a.table === "silver_customer";
    const cust = customers[r.int(customers.length)];
    const changed = addDays(start, r.int(1080));
    const pairs: Record<string, [string, string]> = {
      address_county: [countyOf(cust.countyCode).name, countyOf(r.pick(COUNTIES).code).name],
      risk_classification: [r.pick(["Standard", "Preferred", "Substandard"]), r.pick(["Standard", "Preferred", "Substandard", "Rated"])],
      policy_status: [r.pick(["Active", "Lapsed"]), r.pick(["Active", "Lapsed", "Cancelled", "Renewed"])],
      agent_assignment: [`AGT-${pad(r.int(300) + 1, 3)}`, `AGT-${pad(r.int(300) + 1, 3)}`],
      ownership: [cust.customerId, customers[r.int(customers.length)].customerId],
      phone_number: [phoneFor(r, cust.countyCode), phoneFor(r, cust.countyCode)],
    };
    const [oldV, newV] = pairs[a.attribute];
    scdEvents.push({
      id: `SCD-${pad(i + 1, 5)}`,
      tableName: a.table,
      strategy: a.strategy,
      entityKey: isCust ? cust.customerId : `POL-${pad(r.int(policies.length) + 1, 5)}`,
      entityLabel: cust.fullName,
      attribute: a.attribute,
      oldValue: oldV,
      newValue: newV,
      changedAt: isoTs(changed),
      changedBy: r.pick(["debezium-cdc", "airflow:scd_snapshot", "agent-portal", "batch:nightly_scd"]),
      validFrom: iso(changed),
      validTo: a.strategy === "SCD Type 2" && r.chance(0.55) ? iso(addDays(changed, r.int(400) + 30)) : null,
    });
  }

  return {
    asOf,
    start,
    providers,
    agents,
    customers,
    vehicles,
    policies,
    claims,
    payments,
    telematics,
    bronze,
    scdEvents,
    fraudRings: rings,
    counts: {
      bronze_events: bronze.length,
      customers: customers.length,
      policies: policies.length,
      claims: claims.length,
      payments: payments.length,
      vehicles: vehicles.length,
      providers: providers.length,
      agents: agents.length,
      telematics: telematics.length,
    },
  };
}
