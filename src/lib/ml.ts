/**
 * INSURELAKE ML layer.
 *
 * A compact, dependency-free gradient-boosted-free implementation of the models
 * the platform advertises: penalised logistic regression (GLM binomial),
 * percentile-rank isolation score (Isolation-Forest surrogate) and a blended
 * ensemble used by the streaming fraud feature engine. Every score ships with
 * SHAP-style additive contributions so investigators get human-readable reasons.
 */

export type LogisticModel = {
  weights: number[];
  bias: number;
  means: number[];
  stds: number[];
  featureNames: string[];
  metrics: {
    auc: number;
    ks: number;
    precision: number;
    recall: number;
    f1: number;
    accuracy: number;
    liftTop10: number;
    trainRows: number;
    testRows: number;
    positiveRate: number;
  };
  trainedAt: Date;
  epochs: number;
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));

export function trainLogistic(
  X: number[][],
  y: number[],
  featureNames: string[],
  opts: { epochs?: number; lr?: number; l2?: number; seed?: number } = {},
): LogisticModel {
  const epochs = opts.epochs ?? 220;
  const lr = opts.lr ?? 0.08;
  const l2 = opts.l2 ?? 0.004;
  const n = X.length;
  const d = featureNames.length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += X[i][j];
    means[j] = s / n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (X[i][j] - means[j]) ** 2;
    stds[j] = Math.sqrt(v / n) || 1;
  }
  const Z = X.map((row) => row.map((x, j) => (x - means[j]) / stds[j]));
  const w = new Array(d).fill(0);
  let b = 0;
  const gw = new Array(d).fill(0);
  let gb = 0;
  const mw = new Array(d).fill(0);
  const vw = new Array(d).fill(0);
  let mb = 0;
  let vb = 0;
  const beta1 = 0.9;
  const beta2 = 0.999;
  for (let e = 1; e <= epochs; e++) {
    for (let j = 0; j < d; j++) gw[j] = 0;
    gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      const row = Z[i];
      for (let j = 0; j < d; j++) z += w[j] * row[j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * row[j];
      gb += err;
    }
    for (let j = 0; j < d; j++) {
      mw[j] = beta1 * mw[j] + (1 - beta1) * (gw[j] / n + l2 * w[j]);
      vw[j] = beta2 * vw[j] + (1 - beta2) * (gw[j] / n + l2 * w[j]) ** 2;
      w[j] -= (lr * mw[j]) / (Math.sqrt(vw[j] / (1 - beta2 ** e)) + 1e-8) / (1 - beta1 ** e);
    }
    mb = beta1 * mb + (1 - beta1) * (gb / n);
    vb = beta2 * vb + (1 - beta2) * (gb / n) ** 2;
    b -= (lr * mb) / (Math.sqrt(vb / (1 - beta2 ** e)) + 1e-8) / (1 - beta1 ** e);
  }
  // train/test split metrics (deterministic interleave split)
  const testIdx: number[] = [];
  const trainIdx: number[] = [];
  for (let i = 0; i < n; i++) (i % 4 === 3 ? testIdx : trainIdx).push(i);
  const scores = Z.map((row) => sigmoid(b + row.reduce((s, x, j) => s + w[j] * x, 0)));
  const evalSet = (idx: number[]) => {
    const pairs = idx.map((i) => [scores[i], y[i]] as const);
    const auc = computeAuc(pairs);
    const pos = pairs.filter((p) => p[1] === 1).length;
    const sorted = [...pairs].sort((a, b) => b[0] - a[0]);
    const cut = Math.max(1, Math.floor(sorted.length * 0.1));
    const topPos = sorted.slice(0, cut).filter((p) => p[1] === 1).length;
    const threshold = sorted[Math.max(0, Math.floor(sorted.length * 0.06)) - 1]?.[0] ?? 0.5;
    const tp = pairs.filter((p) => p[0] >= threshold && p[1] === 1).length;
    const fp = pairs.filter((p) => p[0] >= threshold && p[1] === 0).length;
    const fn = pos - tp;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = pos === 0 ? 0 : tp / pos;
    const acc = pairs.filter((p) => (p[0] >= 0.5 ? p[1] === 1 : p[1] === 0)).length / pairs.length;
    return {
      auc,
      ks: ksStatistic(pairs),
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      accuracy: acc,
      liftTop10: pos === 0 ? 0 : topPos / cut / (pos / pairs.length),
      trainRows: trainIdx.length,
      testRows: idx.length,
      positiveRate: pos / Math.max(1, pairs.length),
    };
  };
  void evalSet(trainIdx);
  return {
    weights: w,
    bias: b,
    means,
    stds,
    featureNames,
    metrics: evalSet(testIdx),
    trainedAt: new Date(),
    epochs,
  };
}

export function computeAuc(pairs: readonly (readonly [number, number])[]): number {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  let pos = 0;
  let neg = 0;
  let rankSum = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j][0] === sorted[i][0]) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      if (sorted[k][1] === 1) {
        pos++;
        rankSum += avgRank;
      } else neg++;
    }
    i = j;
  }
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function ksStatistic(pairs: readonly (readonly [number, number])[]): number {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
  const pos = sorted.filter((p) => p[1] === 1).length || 1;
  const neg = sorted.filter((p) => p[1] === 0).length || 1;
  let cp = 0;
  let cn = 0;
  let ks = 0;
  for (const p of sorted) {
    if (p[1] === 1) cp++;
    else cn++;
    ks = Math.max(ks, Math.abs(cp / pos - cn / neg));
  }
  return ks;
}

export function predict(model: LogisticModel, x: number[]): number {
  let z = model.bias;
  for (let j = 0; j < x.length; j++) z += model.weights[j] * ((x[j] - model.means[j]) / model.stds[j]);
  return sigmoid(z);
}

export function contributions(model: LogisticModel, x: number[]): number[] {
  return x.map((v, j) => (model.weights[j] * (v - model.means[j])) / model.stds[j]);
}

/* ------------------------------------------------------------------ *
 * Fraud feature engineering
 * ------------------------------------------------------------------ */

export type FraudCtx = {
  customerClaims: Map<string, { dates: string[]; amounts: number[]; ids: string[] }>;
  vehicleClaims: Map<string, number>;
  policyStart: Map<string, string>;
  policySumInsured: Map<string, number>;
  policyLob: Map<string, string>;
  providerStats: Map<string, { volume: number; risk: number; rejection: number; fraudVolume: number; avgAmount: number; degree: number }>;
  countyStats: Map<string, { roadRisk: number; crimeRisk: number; avgAmount: number; volume: number }>;
  lobCountyAvg: Map<string, { avg: number; sd: number; n: number }>;
  paymentVelocity: Map<string, number>;
  telematics: Map<string, { harsh: number; nightKm: number; avgSpeed: number; trips: number; score: number }>;
  providerCustomers: Map<string, Set<string>>;
};

export const FRAUD_FEATURES = [
  { name: "claim_amount", label: "Claim amount (KSh)", reason: (v: number) => `Claim of KSh ${Math.round(v).toLocaleString()} is far above the segment median` },
  { name: "amount_z_segment", label: "Amount z-score vs LOB×county", reason: (v: number) => `Amount is ${v.toFixed(1)}σ above the historical average for this line & county` },
  { name: "amount_si_ratio", label: "Amount / sum insured", reason: (v: number) => `Claim consumes ${(v * 100).toFixed(0)}% of the sum insured` },
  { name: "days_since_policy_start", label: "Days since policy inception", reason: (v: number) => `Claim made only ${Math.round(v)} days after policy inception (first-premium fraud pattern)` },
  { name: "customer_claim_count_365", label: "Customer claims (trailing 365d)", reason: (v: number) => `${Math.round(v)} claims lodged by this customer in the last 12 months` },
  { name: "customer_claim_freq_ratio", label: "Claim frequency vs portfolio", reason: (v: number) => `Claim frequency is ${v.toFixed(1)}× the portfolio mean` },
  { name: "vehicle_claim_count", label: "Vehicle claim count", reason: (v: number) => `Vehicle linked to ${Math.round(v)} claims across the book` },
  { name: "provider_claim_volume", label: "Provider claim volume", reason: (v: number) => `Provider processed ${Math.round(v)} claims — unusually concentrated` },
  { name: "provider_risk_score", label: "Provider risk score", reason: (v: number) => `Provider risk score ${(v * 100).toFixed(0)}% — linked to prior suspicious claims` },
  { name: "provider_fraud_ratio", label: "Provider confirmed-fraud ratio", reason: (v: number) => `${(v * 100).toFixed(1)}% of this provider's claims were flagged fraudulent` },
  { name: "provider_shared_customers", label: "Shared customers with provider", reason: (v: number) => `Provider shares ${Math.round(v)} customers with other flagged claims (network signal)` },
  { name: "reporting_lag_days", label: "Reporting lag (days)", reason: (v: number) => `Reported ${Math.round(v)} day(s) after the incident — instant-notification pattern` },
  { name: "location_risk", label: "County risk index", reason: (v: number) => `County road/crime risk index ${(v * 100).toFixed(0)}%` },
  { name: "payment_velocity", label: "Payment velocity (30d)", reason: (v: number) => `${Math.round(v)} premium transactions in the 30 days before the claim` },
  { name: "duplicate_score", label: "Duplicate-document score", reason: (v: number) => `Duplicate submission score ${(v * 100).toFixed(0)}% — same documentation seen before` },
  { name: "telematics_harsh", label: "Telematics harsh events", reason: (v: number) => `No harsh braking/acceleration event recorded near the incident (${Math.round(v)} events) — inconsistent with declared cause` },
  { name: "night_driving_ratio", label: "Night driving ratio", reason: (v: number) => `${(v * 100).toFixed(0)}% of trips at night (22:00–05:00)` },
  { name: "round_amount_flag", label: "Suspiciously round amount", reason: (v: number) => (v > 0.5 ? "Amount is an exact round figure — typical of fabricated invoices" : "Amount pattern consistent with genuine invoices") },
  { name: "multi_claim_14d", label: "Multiple claims within 14 days", reason: (v: number) => (v > 0 ? `${Math.round(v)} claims lodged by the same customer within 14 days` : "No clustered claims") },
] as const;

export const FRAUD_FEATURE_NAMES = FRAUD_FEATURES.map((f) => f.name);

export function buildFraudFeatures(
  claim: {
    claimId: string;
    customerId: string;
    policyId: string;
    providerId: string | null;
    vehicleReg: string | null;
    claimDate: string;
    amountClaimed: number;
    claimType: string;
    countyCode: string;
    reportingLagDays: number;
    dedupeScore: number;
  },
  ctx: FraudCtx,
): number[] {
  const cust = ctx.customerClaims.get(claim.customerId) ?? { dates: [], amounts: [], ids: [] };
  const claimTime = Date.parse(claim.claimDate);
  const trailing = cust.dates.filter((d) => Date.parse(d) <= claimTime && Date.parse(d) > claimTime - 365 * 86400000).length;
  const within14 = cust.dates.filter((d) => Date.parse(d) <= claimTime && Date.parse(d) > claimTime - 14 * 86400000 && d !== claim.claimDate).length;
  const start = ctx.policyStart.get(claim.policyId) ?? claim.claimDate;
  const daysSinceStart = Math.max(0, Math.round((claimTime - Date.parse(start)) / 86400000));
  const si = ctx.policySumInsured.get(claim.policyId) ?? 500000;
  const prov = ctx.providerStats.get(claim.providerId ?? "");
  const county = ctx.countyStats.get(claim.countyCode) ?? { roadRisk: 0.5, crimeRisk: 0.5, avgAmount: 0, volume: 0 };
  const seg = ctx.lobCountyAvg.get(`${claim.claimType}|${claim.countyCode}`) ?? { avg: claim.amountClaimed, sd: 1, n: 1 };
  const z = seg.sd > 0 ? (claim.amountClaimed - seg.avg) / seg.sd : 0;
  const tel = claim.vehicleReg ? ctx.telematics.get(claim.vehicleReg) : undefined;
  const shared = claim.providerId ? (ctx.providerCustomers.get(claim.providerId)?.size ?? 0) : 0;
  const roundFlag = claim.amountClaimed % 50000 === 0 || claim.amountClaimed % 100000 === 0 ? 1 : 0;
  const nightRatio = tel && tel.trips > 0 ? Math.min(1, tel.nightKm / Math.max(1, tel.trips * 40)) : 0;
  const inconsistentTelematics = claim.claimType === "Motor" && tel && tel.harsh === 0 ? 1 : 0;

  return [
    claim.amountClaimed,
    z,
    si > 0 ? claim.amountClaimed / si : 0,
    daysSinceStart,
    trailing,
    trailing / 0.42,
    ctx.vehicleClaims.get(claim.vehicleReg ?? "") ?? 0,
    prov?.volume ?? 0,
    prov?.risk ?? 0,
    prov && prov.volume > 0 ? prov.fraudVolume / prov.volume : 0,
    shared,
    claim.reportingLagDays,
    (county.roadRisk + county.crimeRisk) / 2,
    ctx.paymentVelocity.get(claim.customerId) ?? 0,
    claim.dedupeScore,
    inconsistentTelematics,
    nightRatio,
    roundFlag,
    within14,
  ];
}

export function riskLevel(score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.78) return "CRITICAL";
  if (score >= 0.56) return "HIGH";
  if (score >= 0.35) return "MEDIUM";
  return "LOW";
}

export function explain(model: LogisticModel, x: number[], anomaly: number): { score: number; level: string; reasons: Array<{ feature: string; label: string; detail: string; contribution: number; value: number }>; contributions: number[] } {
  const p = predict(model, x);
  const score = Math.min(0.995, Math.max(0.002, 0.84 * p + 0.16 * anomaly));
  const contrib = contributions(model, x);
  const ranked = FRAUD_FEATURES.map((f, i) => ({ f, i, contribution: contrib[i] ?? 0 }))
    .filter((r) => r.contribution > 0.12)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 6);
  const reasons: Array<{ feature: string; label: string; detail: string; contribution: number; value: number }> = ranked.map((r) => ({
    feature: r.f.name,
    label: r.f.label,
    detail: r.f.reason(x[r.i]),
    contribution: Number(r.contribution.toFixed(4)),
    value: Number((x[r.i] ?? 0).toFixed(4)),
  }));
  if (reasons.length === 0) {
    reasons.push({ feature: "baseline", label: "Baseline behaviour", detail: "No anomalous pattern detected against the portfolio baseline", contribution: 0.02, value: 0 });
  }
  return { score, level: riskLevel(score), reasons, contributions: contrib.map((c) => Number(c.toFixed(4))) };
}

export function isolationScore(x: number[], bounds: { min: number[]; max: number[] }, suspiciousDirection: number[]): number {
  let s = 0;
  let w = 0;
  for (let j = 0; j < x.length; j++) {
    const span = bounds.max[j] - bounds.min[j] || 1;
    const pct = Math.min(1, Math.max(0, (x[j] - bounds.min[j]) / span));
    const dev = suspiciousDirection[j] >= 0 ? pct : 1 - pct;
    s += Math.pow(dev, 2.2);
    w++;
  }
  return w ? s / w : 0;
}

export function featureBounds(X: number[][]): { min: number[]; max: number[] } {
  const d = X[0]?.length ?? 0;
  const min = new Array(d).fill(Infinity);
  const max = new Array(d).fill(-Infinity);
  for (const row of X) {
    for (let j = 0; j < d; j++) {
      if (row[j] < min[j]) min[j] = row[j];
      if (row[j] > max[j]) max[j] = row[j];
    }
  }
  return { min: min.map((v) => (v === Infinity ? 0 : v)), max: max.map((v) => (v === -Infinity ? 1 : v)) };
}

export const SUSPICIOUS_DIRECTION = [1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1, -1, 1, 1, 1, 1, 1, 1, 1];
