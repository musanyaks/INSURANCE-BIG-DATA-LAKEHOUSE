"""Composite policy risk scoring — blends claims experience, severity,
telematics behaviour and payment discipline into a 0-100 score and tier.

    python -m ml.risk.risk_scoring
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from common.config import DATA_END, get_logger
from common.datasets import load_claims, load_driving_scores, load_payments, load_policies
from ml.registry import register

log = get_logger("ml.risk")
OUT = Path(__file__).resolve().parent / "output"
WEIGHTS = {"frequency": 0.35, "severity": 0.30, "telematics": 0.20, "payments": 0.15}


def main() -> dict:
    policies = load_policies()
    if policies is None:
        log.error("No policy data.")
        return {}
    end = pd.Timestamp(DATA_END)
    df = policies[["policy_id", "product", "region", "annual_premium"]].copy()
    df["months_exposure"] = ((policies.expiry_date.clip(upper=end)
                              - policies.effective_date).dt.days / 30.44).clip(1)

    claims = load_claims()
    if claims is not None:
        agg = claims.groupby("policy_id").agg(n_claims=("claim_id", "count"),
                                              incurred=("claim_amount", "sum"))
        df = df.merge(agg, on="policy_id", how="left").fillna({"n_claims": 0, "incurred": 0.0})
    else:
        df["n_claims"], df["incurred"] = 0, 0.0

    payments = load_payments()
    if payments is not None:
        fails = (payments[payments.status != "Paid"].groupby("policy_id").size()
                 .reindex(df.policy_id).fillna(0))
        totals = payments.groupby("policy_id").size().reindex(df.policy_id).fillna(1)
        df["payment_failure_rate"] = (fails / totals).values
    else:
        df["payment_failure_rate"] = 0.0

    scores = load_driving_scores()
    if scores is not None:
        df["driving_score"] = df.policy_id.map(scores)
    has_tel = df.driving_score.notna().any()

    freq_component = df.n_claims / df.months_exposure
    rank = lambda s: s.rank(pct=True, na_option="keep")  # noqa: E731
    comps = {"frequency": rank(freq_component), "severity": rank(df.incurred),
             "payments": rank(df.payment_failure_rate)}
    if has_tel:
        comps["telematics"] = rank(100 - df.driving_score)

    wsum = sum(WEIGHTS[k] for k in comps)
    risk = sum(WEIGHTS[k] * c for k, c in comps.items()) / wsum
    risk = risk.fillna(risk.median() if risk.notna().any() else 0.5)
    df["risk_score"] = (100 * risk).round(1)
    df["risk_tier"] = pd.cut(df.risk_score, [-0.1, 20, 40, 60, 80, 101],
                             labels=[1, 2, 3, 4, 5]).astype(int)

    OUT.mkdir(exist_ok=True)
    df.to_parquet(OUT / "risk_scores.parquet", index=False)
    tier_summary = (df.groupby("risk_tier")
                    .agg(policies=("policy_id", "count"),
                         avg_claims=("n_claims", "mean"),
                         avg_incurred=("incurred", "mean")).round(2).reset_index())
    tier_summary.to_csv(OUT / "risk_tier_summary.csv", index=False)
    summary = {"method": "weighted percentile blend (frequency/severity/telematics/payments)",
               "policies": int(len(df)), "weights_used": {k: round(WEIGHTS[k] / wsum, 2) for k in comps},
               "telematics_included": bool(has_tel),
               "tier_distribution": tier_summary.to_dict("records")}
    (OUT / "risk_summary.json").write_text(json.dumps(summary, indent=2, default=str))
    register("risk_scoring", str(OUT / "risk_scores.parquet"), summary,
             "weighted_percentile_blend", features=list(WEIGHTS))
    log.info("Risk scoring complete: %d policies → %s", len(df), OUT / "risk_scores.parquet")
    return summary


if __name__ == "__main__":
    main()
