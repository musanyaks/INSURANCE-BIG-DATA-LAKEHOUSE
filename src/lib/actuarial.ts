/**
 * INSURELAKE actuarial intelligence layer.
 *
 *  - Paid / incurred development triangles by line of business
 *  - Chain Ladder (volume weighted LDFs)
 *  - Mack (1993) analytical standard error & coefficient of variation
 *  - Bornhuetter-Ferguson with a-priori loss ratio from the pricing model
 *  - Cape Cod / Stanard-Bühlmann (ELR derived from used-up premium)
 *  - Frequency × Severity pure-premium pricing segments with relativities
 */

export type TriangleCell = number | null;
export type Triangle = {
  origins: string[];
  maxDev: number;
  incremental: TriangleCell[][];
  cumulative: TriangleCell[][];
};

export type TriangleInput = { origin: string; dev: number; amount: number };

export function buildTriangle(origins: string[], inputs: TriangleInput[]): Triangle {
  const maxDev = origins.length;
  const idx = new Map(origins.map((o, i) => [o, i]));
  const incremental: TriangleCell[][] = origins.map(() => new Array(maxDev).fill(null));
  for (const o of origins) {
    const i = idx.get(o)!;
    for (let k = 0; k < maxDev; k++) incremental[i][k] = i + k < maxDev ? 0 : null;
  }
  for (const row of inputs) {
    const i = idx.get(row.origin);
    if (i === undefined) continue;
    if (row.dev < 0 || row.dev >= maxDev) continue;
    if (i + row.dev >= maxDev) continue;
    incremental[i][row.dev] = (incremental[i][row.dev] ?? 0) + row.amount;
  }
  const cumulative: TriangleCell[][] = origins.map(() => new Array(maxDev).fill(null));
  for (let i = 0; i < origins.length; i++) {
    let acc = 0;
    for (let k = 0; k < maxDev; k++) {
      if (i + k >= maxDev) break;
      acc += incremental[i][k] ?? 0;
      cumulative[i][k] = acc;
    }
  }
  return { origins, maxDev, incremental, cumulative };
}

export function ldf(t: Triangle): number[] {
  const f: number[] = [];
  for (let k = 0; k < t.maxDev - 1; k++) {
    let num = 0;
    let den = 0;
    for (let i = 0; i + k + 1 < t.maxDev; i++) {
      const a = t.cumulative[i][k];
      const b = t.cumulative[i][k + 1];
      if (a === null || b === null || a <= 0) continue;
      num += b;
      den += a;
    }
    f.push(den > 0 ? num / den : 1);
  }
  f.push(1); // tail
  return f;
}

export function cdfFrom(f: number[]): number[] {
  const cdf = new Array<number>(f.length).fill(1);
  for (let k = f.length - 2; k >= 0; k--) cdf[k] = cdf[k + 1] * f[k];
  return cdf;
}

export type ReserveRow = {
  origin: string;
  paidToDate: number;
  cdf: number;
  ultimate: number;
  ibnr: number;
  mackStdError: number | null;
  coefficientOfVariation: number | null;
  aprioriLossRatio: number | null;
  reserveAdequacy: number | null;
};

export function mackSigma(t: Triangle, f: number[]): number[] {
  const sigma2: number[] = [];
  for (let k = 0; k < t.maxDev - 1; k++) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i + k + 1 < t.maxDev; i++) {
      const a = t.cumulative[i][k];
      const b = t.cumulative[i][k + 1];
      if (a === null || b === null || a <= 0) continue;
      sum += a * (b / a - f[k]) ** 2;
      n++;
    }
    sigma2.push(n > 1 ? sum / (n - 1) : 0);
  }
  // Mack's fallback for the last development period with insufficient pairs
  for (let k = sigma2.length - 1; k >= 0; k--) {
    if (sigma2[k] === 0 && k > 0) {
      sigma2[k] = Math.min(sigma2[k - 1] || 0, sigma2[Math.max(0, k - 2)] || 0);
    }
  }
  return sigma2.map((s) => Math.sqrt(Math.max(0, s)));
}

export function chainLadder(t: Triangle, f = ldf(t)): ReserveRow[] {
  const cdf = cdfFrom(f);
  const sigma = mackSigma(t, f);
  const n = t.maxDev;
  const rows: ReserveRow[] = [];
  const projected: number[][] = t.origins.map(() => new Array(n).fill(0));
  for (let i = 0; i < t.origins.length; i++) {
    const lastDev = n - 1 - i;
    let c = t.cumulative[i][lastDev] ?? 0;
    for (let k = 0; k <= lastDev; k++) projected[i][k] = t.cumulative[i][k] ?? 0;
    for (let k = lastDev + 1; k < n; k++) {
      c = c * f[k - 1];
      projected[i][k] = c;
    }
    const ultimate = c;
    const paid = t.cumulative[i][lastDev] ?? 0;
    // Mack MSE for this origin year
    let mse = 0;
    for (let k = lastDev; k < n - 1; k++) {
      const chatK = projected[i][k];
      const chatK1 = projected[i][k + 1];
      let sumCol = 0;
      for (let j = 0; j + k < n; j++) sumCol += t.cumulative[j][k] ?? 0;
      const fk = f[k] || 1;
      mse += (chatK1 ** 2 * sigma[k] ** 2) / (fk ** 2) * (1 / Math.max(1, chatK) + 1 / Math.max(1, sumCol));
    }
    rows.push({
      origin: t.origins[i],
      paidToDate: paid,
      cdf: cdf[lastDev],
      ultimate,
      ibnr: Math.max(0, ultimate - paid),
      mackStdError: Math.sqrt(Math.max(0, mse)),
      coefficientOfVariation: ultimate - paid > 0 ? Math.sqrt(Math.max(0, mse)) / (ultimate - paid) : null,
      aprioriLossRatio: null,
      reserveAdequacy: null,
    });
  }
  // process/correlation term across origin years (Mack 1993, second summand)
  let cross = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const li = n - 1 - i;
      const lj = n - 1 - j;
      for (let k = li; k < Math.min(lj, n - 1); k++) {
        let sumCol = 0;
        for (let m = 0; m + k < n; m++) sumCol += t.cumulative[m][k] ?? 0;
        cross += (projected[i][k + 1] * projected[j][k + 1] * sigma[k] ** 2) / ((f[k] || 1) ** 2 * Math.max(1, sumCol));
      }
    }
  }
  const totalSe = Math.sqrt(Math.max(0, rows.reduce((s, r) => s + (r.mackStdError ?? 0) ** 2, 0) + 2 * cross));
  const totalIbnr = rows.reduce((s, r) => s + r.ibnr, 0);
  rows.forEach((r) => {
    r.reserveAdequacy = r.paidToDate > 0 ? r.ibnr / r.paidToDate : null;
  });
  void totalSe;
  void totalIbnr;
  return rows;
}

export function mackTotal(t: Triangle, rows: ReserveRow[]): { se: number; cv: number } {
  const f = ldf(t);
  const sigma = mackSigma(t, f);
  const n = t.maxDev;
  const projected: number[][] = t.origins.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const lastDev = n - 1 - i;
    for (let k = 0; k <= lastDev; k++) projected[i][k] = t.cumulative[i][k] ?? 0;
    let c = t.cumulative[i][lastDev] ?? 0;
    for (let k = lastDev + 1; k < n; k++) {
      c *= f[k - 1];
      projected[i][k] = c;
    }
  }
  let within = 0;
  for (let i = 0; i < n; i++) {
    const lastDev = n - 1 - i;
    for (let k = lastDev; k < n - 1; k++) {
      let sumCol = 0;
      for (let j = 0; j + k < n; j++) sumCol += t.cumulative[j][k] ?? 0;
      within += (projected[i][k + 1] ** 2 * sigma[k] ** 2) / ((f[k] || 1) ** 2) * (1 / Math.max(1, projected[i][k]) + 1 / Math.max(1, sumCol));
    }
  }
  let cross = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const li = n - 1 - i;
      const lj = n - 1 - j;
      for (let k = li; k < Math.min(lj, n - 1); k++) {
        let sumCol = 0;
        for (let m = 0; m + k < n; m++) sumCol += t.cumulative[m][k] ?? 0;
        cross += (projected[i][k + 1] * projected[j][k + 1] * sigma[k] ** 2) / ((f[k] || 1) ** 2 * Math.max(1, sumCol));
      }
    }
  }
  const se = Math.sqrt(Math.max(0, within + 2 * cross));
  const ibnr = rows.reduce((s, r) => s + r.ibnr, 0);
  return { se, cv: ibnr > 0 ? se / ibnr : 0 };
}

export function bornhuetterFerguson(t: Triangle, premium: Map<string, number>, aprioriLr: number): ReserveRow[] {
  const f = ldf(t);
  const cdf = cdfFrom(f);
  const rows: ReserveRow[] = [];
  for (let i = 0; i < t.origins.length; i++) {
    const lastDev = t.maxDev - 1 - i;
    const paid = t.cumulative[i][lastDev] ?? 0;
    const ep = premium.get(t.origins[i]) ?? 0;
    const apriori = ep * aprioriLr;
    const ultimate = paid + (1 - 1 / cdf[lastDev]) * apriori;
    rows.push({
      origin: t.origins[i],
      paidToDate: paid,
      cdf: cdf[lastDev],
      ultimate,
      ibnr: Math.max(0, ultimate - paid),
      mackStdError: null,
      coefficientOfVariation: null,
      aprioriLossRatio: aprioriLr,
      reserveAdequacy: paid > 0 ? (ultimate - paid) / paid : null,
    });
  }
  return rows;
}

export function capeCod(t: Triangle, premium: Map<string, number>): ReserveRow[] {
  const f = ldf(t);
  const cdf = cdfFrom(f);
  let usedTotal = 0;
  let paidTotal = 0;
  const used: number[] = [];
  for (let i = 0; i < t.origins.length; i++) {
    const lastDev = t.maxDev - 1 - i;
    const ep = premium.get(t.origins[i]) ?? 0;
    const u = ep / cdf[lastDev];
    used.push(u);
    usedTotal += u;
    paidTotal += t.cumulative[i][lastDev] ?? 0;
  }
  const elr = usedTotal > 0 ? paidTotal / usedTotal : 0;
  return t.origins.map((origin, i) => {
    const lastDev = t.maxDev - 1 - i;
    const paid = t.cumulative[i][lastDev] ?? 0;
    const ultimate = paid + (1 - 1 / cdf[lastDev]) * used[i] * elr;
    return {
      origin,
      paidToDate: paid,
      cdf: cdf[lastDev],
      ultimate,
      ibnr: Math.max(0, ultimate - paid),
      mackStdError: null,
      coefficientOfVariation: null,
      aprioriLossRatio: elr,
      reserveAdequacy: paid > 0 ? (ultimate - paid) / paid : null,
    } satisfies ReserveRow;
  });
}

/* ------------------------------------------------------------------ *
 * Pricing: Expected loss = frequency × severity
 * ------------------------------------------------------------------ */

export type PricingRow = {
  id: string;
  segment: string;
  dimensionA: string;
  dimensionB: string;
  lob: string;
  exposure: number;
  claimCount: number;
  frequency: number;
  severity: number;
  purePremium: number;
  relativity: number;
  averagePremium: number;
  lossRatio: number;
  indicatedRateChange: number;
  telematicsAdj: number;
};

export function pricingSegments(input: {
  lob: string;
  segments: Array<{ dimensionA: string; dimensionB: string; exposure: number; premium: number; claims: number; paid: number; driverScore: number }>;
}): PricingRow[] {
  const basePure = input.segments.reduce((s, x) => s + x.paid, 0) / Math.max(1, input.segments.reduce((s, x) => s + x.exposure, 0));
  return input.segments
    .filter((s) => s.exposure > 0)
    .map((s, i) => {
      const frequency = s.claims / s.exposure;
      const severity = s.claims > 0 ? s.paid / s.claims : 0;
      const purePremium = frequency * severity;
      const avgPremium = s.premium / s.exposure;
      const telematics = (s.driverScore - 75) / 100; // driver score 0-100, neutral at 75
      return {
        id: `${input.lob}-${i}`,
        segment: `${s.dimensionA} · ${s.dimensionB}`,
        dimensionA: s.dimensionA,
        dimensionB: s.dimensionB,
        lob: input.lob,
        exposure: s.exposure,
        claimCount: s.claims,
        frequency,
        severity,
        purePremium,
        relativity: basePure > 0 ? purePremium / basePure : 0,
        averagePremium: avgPremium,
        lossRatio: avgPremium > 0 ? purePremium / avgPremium : 0,
        indicatedRateChange: avgPremium > 0 ? purePremium / avgPremium - 1 : 0,
        telematicsAdj: Math.max(-0.25, Math.min(0.25, telematics)),
      } satisfies PricingRow;
    });
}

export function quarterList(from: Date, to: Date, count = 14): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(to.getUTCFullYear(), Math.floor(to.getUTCMonth() / 3) * 3, 1));
  for (let i = 0; i < count; i++) {
    out.unshift(`${cur.getUTCFullYear()}Q${Math.floor(cur.getUTCMonth() / 3) + 1}`);
    cur.setUTCMonth(cur.getUTCMonth() - 3);
  }
  void from;
  return out;
}

export function quarterIndex(origin: string, quarters: string[]): number {
  return quarters.indexOf(origin);
}
