"""Claim severity model — Gamma GLM with log link on closed claim costs.

    python -m actuarial.severity.severity_model
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from common.config import get_logger
from common.datasets import load_claims, load_customers, load_driving_scores, load_policies

log = get_logger("actuarial.severity")
OUT = Path(__file__).resolve().parent / "output"
MODEL_FEATURES = ["product", "region", "age_band"]


def build_severity_frame() -> pd.DataFrame | None:
    claims, policies, customers = load_claims(), load_policies(), load_customers()
    if claims is None or claims.empty or policies is None:
        log.error("No claims data — run the pipeline or `make seed-data` first.")
        return None
    df = claims[claims.paid_amount > 0][["claim_id", "policy_id", "peril",
                                         "claim_amount"]].copy()
    df = df.merge(policies[["policy_id", "product", "region", "customer_id"]],
                  on="policy_id", how="left")
    df = df.merge(customers[["customer_id", "age_band"]], on="customer_id", how="left")
    scores = load_driving_scores()
    df["driving_score"] = (df.policy_id.map(scores) if scores is not None else np.nan)
    df["driving_score"] = df["driving_score"].fillna(
        df["driving_score"].median() if df["driving_score"].notna().any() else 75.0)
    return df


def fit_severity_glm(df: pd.DataFrame):
    import statsmodels.api as sm

    X = pd.get_dummies(df[MODEL_FEATURES], drop_first=True, dtype=float)
    X["log_peril_index"] = df["peril"].map(
        df.groupby("peril").claim_amount.median().pipe(np.log)).fillna(8.0).values
    X = sm.add_constant(X)
    y = df["claim_amount"].astype(float)
    try:
        model = sm.GLM(y, X, family=sm.families.Gamma(sm.families.links.Log())).fit()
    except Exception as exc:
        log.warning("Plain Gamma GLM failed (%s) — fitting L2-regularised.", exc)
        model = sm.GLM(y, X, family=sm.families.Gamma(sm.families.links.Log())
                       ).fit_regularized(alpha=0.5, L1_wt=0)
    return model, X


def main() -> dict:
    df = build_severity_frame()
    if df is None:
        return {}
    model, X = fit_severity_glm(df)
    OUT.mkdir(exist_ok=True)

    result = {
        "model": "Gamma GLM (log link) on paid claim amounts",
        "rows": int(len(df)),
        "mean_severity": round(float(df.claim_amount.mean()), 2),
        "median_severity": round(float(df.claim_amount.median()), 2),
        "coefficients": {k: round(float(v), 4) for k, v in model.params.items()},
    }
    (OUT / "severity_glm.json").write_text(json.dumps(result, indent=2))
    (OUT / "severity_glm_summary.txt").write_text(str(model.summary()))
    log.info("Severity GLM fitted: mean paid severity $%,.0f across %d claims",
             result["mean_severity"], result["rows"])
    return result


if __name__ == "__main__":
    main()
