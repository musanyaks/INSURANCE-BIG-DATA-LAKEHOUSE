"""Chain-ladder reserving on paid claims with bootstrap uncertainty.

Builds a cumulative paid triangle (accident quarter × development quarter),
estimates volume-weighted age-to-age factors, projects ultimates and derives
the total unpaid (case + IBNR) with a percentile range from link-ratio
bootstrap resampling.

    python -m actuarial.reserving.chain_ladder
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from common.config import DATA_END, get_logger
from common.datasets import load_claims

log = get_logger("actuarial.reserving")
OUT = Path(__file__).resolve().parent / "output"
BOOTSTRAP_ITERS = 500
RNG = np.random.default_rng(42)


# ─────────────────────────────────────────────────────────────────────────────
# Triangle construction
# ─────────────────────────────────────────────────────────────────────────────
def build_paid_triangle(claims: pd.DataFrame,
                        valuation: pd.Timestamp | None = None) -> pd.DataFrame:
    """Cumulative paid triangle indexed by accident quarter (strings)."""
    valuation = valuation or pd.Timestamp(DATA_END)
    cl = claims.copy()
    cl["accident"] = cl.loss_date.dt.to_period("Q").astype(str)
    acc_q = cl.loss_date.dt.to_period("Q").astype("int64")
    closed_at_val = (cl.closed_date.fillna(pd.Timestamp(valuation + pd.Timedelta(days=366)))
                     .clip(upper=valuation))
    pay_q = pd.to_datetime(closed_at_val).dt.to_period("Q").astype("int64")
    cl["dev"] = (pay_q - acc_q).clip(lower=0)
    paid = cl[["accident", "dev", "paid_amount"]].copy()

    accs = sorted(paid.accident.unique())
    devs = sorted(paid.dev.unique())
    tri = pd.DataFrame(0.0, index=accs, columns=devs)
    for (a, d), v in paid.groupby(["accident", "dev"]).paid_amount.sum().items():
        tri.loc[a, d] = v
    # zero out future cells (beyond the valuation diagonal)
    val_q = valuation.to_period("Q").ordinal
    for a in accs:
        aq = pd.Period(a, freq="Q").ordinal
        for d in devs:
            if aq + d > val_q:
                tri.loc[a, d] = np.nan
    return tri.cumsum(axis=1).where(~tri.isna(), np.nan)


# ─────────────────────────────────────────────────────────────────────────────
# Core chain-ladder maths (pure function — unit-testable on a known triangle)
# ─────────────────────────────────────────────────────────────────────────────
def chain_ladder_from_triangle(tri: pd.DataFrame) -> dict:
    tri = tri.sort_index()
    cols = list(tri.columns)
    ldfs = []
    link_pairs: dict[int, list[tuple[float, float]]] = {}
    for k in range(len(cols) - 1):
        c0, c1 = cols[k], cols[k + 1]
        mask = tri[c0].notna() & tri[c1].notna()
        pairs = [(float(tri.loc[i, c0]), float(tri.loc[i, c1]))
                 for i in tri.index[mask]]
        link_pairs[k] = pairs
        denom = sum(p[0] for p in pairs)
        # volume-weighted (chain-ladder) age-to-age factor:
        f = sum(p[1] for p in pairs) / denom if denom > 0 else 1.0
        ldfs.append(f)
    cdfs = list(np.cumprod(ldfs[::-1])[::-1])  # cdf[k] = ∏ ldfs[k:]

    rows = []
    for a, r in tri.iterrows():
        last = r.last_valid_index()
        if last is None:
            continue
        k = cols.index(last)
        latest = float(r[last])
        cdf = cdfs[k] if k < len(cdfs) else 1.0
        ultimate = latest * cdf
        rows.append({"accident_quarter": a, "paid_to_date": round(latest, 2),
                     "dev_at_valuation": int(last), "cdf_to_ultimate": round(cdf, 4),
                     "ultimate": round(ultimate, 2), "reserve": round(ultimate - latest, 2)})
    by_acc = pd.DataFrame(rows)
    total_paid = float(by_acc.paid_to_date.sum())
    total_ult = float(by_acc.ultimate.sum())
    total_reserve = total_ult - total_paid

    # bootstrap: resample exposure cells per development period, recompute
    # volume-weighted LDFs (standard nonparametric chain-ladder bootstrap)
    sims = []
    if link_pairs:
        for _ in range(BOOTSTRAP_ITERS):
            sim_ldfs = []
            for k in range(len(cols) - 1):
                pairs = link_pairs[k]
                if pairs:
                    idx = RNG.integers(0, len(pairs), len(pairs))
                    sampled = [pairs[j] for j in idx]
                    denom = sum(p[0] for p in sampled)
                    sim_ldfs.append(sum(p[1] for p in sampled) / denom if denom > 0
                                    else ldfs[k])
                else:
                    sim_ldfs.append(ldfs[k])
            sim_cdfs = np.cumprod(sim_ldfs[::-1])[::-1]
            ult = 0.0
            for r in tri.itertuples(index=False):
                values = list(r)
                last = None
                for j in range(len(values) - 1, -1, -1):
                    if pd.notna(values[j]):
                        last = j
                        break
                if last is None:
                    continue
                latest = float(values[last])
                ult += latest * (sim_cdfs[last] if last < len(sim_cdfs) else 1.0)
            sims.append(ult - total_paid)
    ci = (list(np.percentile(sims, [50, 75, 95]).round(2)) if sims
          else [total_reserve, total_reserve, total_reserve])

    return {"ldfs": [round(x, 4) for x in ldfs], "cdfs": [round(x, 4) for x in cdfs],
            "by_accident": by_acc, "paid_to_date": round(total_paid, 2),
            "ultimate": round(total_ult, 2), "total_reserve": round(total_reserve, 2),
            "reserve_p50_p75_p95": ci}


def main() -> dict:
    claims = load_claims()
    if claims is None or claims.empty:
        log.error("No claims data — run the medallion pipeline or `make seed-data`.")
        return {}
    tri = build_paid_triangle(claims)
    res = chain_ladder_from_triangle(tri)

    OUT.mkdir(exist_ok=True)
    tri.round(2).to_csv(OUT / "paid_triangle.csv")
    pd.DataFrame({"dev_period": list(range(1, len(res["ldfs"]) + 1)),
                  "ldf": res["ldfs"], "cdf": res["cdfs"]}).to_csv(
        OUT / "development_factors.csv", index=False)
    res["by_accident"].to_csv(OUT / "reserves_by_accident_quarter.csv", index=False)
    summary = {
        "method": "paid chain ladder, volume-weighted LDFs, 500× bootstrap",
        "valuation_date": str(DATA_END),
        "accident_quarters": int(tri.shape[0]),
        "paid_to_date": res["paid_to_date"],
        "ultimate_estimate": res["ultimate"],
        "total_reserve": res["total_reserve"],
        "reserve_p50": res["reserve_p50_p75_p95"][0],
        "reserve_p75": res["reserve_p50_p75_p95"][1],
        "reserve_p95": res["reserve_p50_p75_p95"][2],
        "development_factors": res["ldfs"],
    }
    (OUT / "reserve_summary.json").write_text(json.dumps(summary, indent=2))
    log.info("Chain ladder: paid-to-date ${:,.0f} → ultimate ${:,.0f} | reserve ${:,.0f} "
             "(p95 ${:,.0f})".format(res["paid_to_date"], res["ultimate"],
                                     res["total_reserve"], res["reserve_p50_p75_p95"][2]))
    return summary


if __name__ == "__main__":
    main()
