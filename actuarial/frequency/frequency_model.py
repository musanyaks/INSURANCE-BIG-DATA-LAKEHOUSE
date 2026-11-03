"""Claim frequency model — Poisson GLM with log exposure offset.

Target : claim counts per policy
Offset : log(exposure years)
Rating factors: product, region, age band, driving score (telematics)

    python -m actuarial.frequency.frequency_model
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from common.config import DATA_END, get_logger
from common.datasets import load_claims, load_customers, load_driving_scores, load_policies

log = get_logger("actuarial.frequency")
OUT = Path(__file__).resolve().parent / "output"

MODEL_FEATURES = ["product", "region", "age_band"]


def build_frequency_frame() -> pd.DataFrame | None:
    policies, claims, customers = load_policies(), load_claims(), load_customers()
    if policies is None or policies.empty:
        log.error("No policy data — run the pipeline or `make seed-data` first.")
        return None

    counts = (claims.groupby("policy_id").size() if claims is not None and not claims.empty
              else pd.Series(dtype=int))
    end = pd.Timestamp(DATA_END)
    exposure = ((policies.expiry_date.clip(upper=end) - policies.effective_date)
                .dt.days.div(365.25).clip(lower=0.05))

    df = policies[["policy_id", "product", "region", "customer_id"]].copy()
    df["claim_count"] = df.policy_id.map(counts).fillna(0).astype(int)
    df["exposure_years"] = exposure.values
    df = df.merge(customers[["customer_id", "age_band"]], on="customer_id", how="left")
    scores = load_driving_scores()
    if scores is not None:
        df["driving_score"] = df.policy_id.map(scores)
    else:
        df["driving_score"] = np.nan
    df["driving_score"] = df["driving_score"].fillna(df["driving_score"].median()
                                                     if df["driving_score"].notna().any() else 75.0)
    return df


def fit_frequency_glm(df: pd.DataFrame):
    import statsmodels.api as sm

    X = pd.get_dummies(df[MODEL_FEATURES], drop_first=True, dtype=float)
    X["driving_score_z"] = (df["driving_score"] - df["driving_score"].mean()) / 50.0
    X = sm.add_constant(X)
    y = df["claim_count"].astype(float)
    offset = np.log(df["exposure_years"].values)
    try:
        model = sm.GLM(y, X, family=sm.families.Poisson(), offset=offset).fit()
    except Exception as exc:  # degenerate small samples → light ridge
        log.warning("Plain Poisson GLM failed (%s) — fitting L2-regularised.", exc)
        model = sm.GLM(y, X, family=sm.families.Poisson(), offset=offset).fit_regularized(alpha=0.5, L1_wt=0)
    return model, X


def main() -> dict:
    df = build_frequency_frame()
    if df is None:
        return {}
    model, X = fit_frequency_glm(df)
    OUT.mkdir(exist_ok=True)

    coefs = {k: round(float(v), 4) for k, v in model.params.items()}
    result = {
        "model": "Poisson GLM (log link, log-exposure offset)",
        "rows": int(len(df)),
        "claims": int(df.claim_count.sum()),
        "empirical_frequency_per_year": round(float(df.claim_count.sum()
                                                    / df.exposure_years.sum()), 4),
        "coefficients": coefs,
        "aic": round(float(model.aic), 2) if hasattr(model, "aic") else None,
    }
    (OUT / "frequency_glm.json").write_text(json.dumps(result, indent=2))
    (OUT / "frequency_glm_summary.txt").write_text(str(model.summary()))
    df_out = df.copy()
    df_out["predicted_frequency"] = model.predict(X, offset=np.log(df_out.exposure_years.values))
    df_out.to_csv(OUT / "policy_frequencies.csv", index=False)
    log.info("Frequency GLM fitted: %.4f claims/policy-year empirical | coefficients → %s",
             result["empirical_frequency_per_year"], OUT / "frequency_glm.json")
    return result


if __name__ == "__main__":
    main()
