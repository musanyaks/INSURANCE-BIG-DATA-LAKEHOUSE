"""Indicated gross pricing from frequency × severity GLMs.

Pure premium  = predicted frequency × predicted severity
Gross premium = pure premium / target loss ratio (68%)

    python -m actuarial.pricing.pricing_glm
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from actuarial.frequency.frequency_model import MODEL_FEATURES, build_frequency_frame, fit_frequency_glm
from actuarial.severity.severity_model import build_severity_frame, fit_severity_glm
from common.config import DATA_END, get_logger
from common.datasets import load_policies

log = get_logger("actuarial.pricing")
OUT = Path(__file__).resolve().parent / "output"
TARGET_LR = 0.68
REGIONS = ["North", "South", "East", "West", "Central"]


def _segment_profiles(products: list[str]) -> pd.DataFrame:
    """Average lives for each product × region cell."""
    rows = []
    for product in products:
        for region in REGIONS:
            rows.append({"product": product, "region": region,
                         "age_band": "36-50", "exposure_years": 1.0})
    return pd.DataFrame(rows)


def main() -> dict:
    freq_df = build_frequency_frame()
    sev_df = build_severity_frame()
    policies = load_policies()
    if freq_df is None or policies is None:
        log.error("Pricing needs policy data — run `make demo` first.")
        return {}

    freq_model, fX = fit_frequency_glm(freq_df)
    profiles = _segment_profiles(sorted(policies["product"].unique()))

    Xf = pd.get_dummies(profiles[MODEL_FEATURES], dtype=float)
    Xf["driving_score_z"] = (75.0 - freq_df["driving_score"].mean()) / 50.0
    Xf = Xf.reindex(columns=fX.columns, fill_value=0.0)
    profiles["predicted_frequency"] = freq_model.predict(Xf, offset=np.zeros(len(profiles)))

    if sev_df is not None and not sev_df.empty:
        sev_model, sX = fit_severity_glm(sev_df)
        Xs = pd.get_dummies(profiles[MODEL_FEATURES], dtype=float)
        Xs["log_peril_index"] = float(np.median(
            sev_df.groupby("peril").claim_amount.median().pipe(np.log)))
        Xs = Xs.reindex(columns=sX.columns, fill_value=0.0)
        profiles["predicted_severity"] = sev_model.predict(Xs)
    else:
        profiles["predicted_severity"] = float(sev_df.claim_amount.median()) if sev_df is not None else 4000.0

    profiles["pure_premium"] = profiles.predicted_frequency * profiles.predicted_severity
    profiles["indicated_gross_premium"] = (profiles.pure_premium / TARGET_LR).round(2)

    end = pd.Timestamp(DATA_END)
    pol = policies.copy()
    pol["months_exposure"] = ((pol.expiry_date.clip(upper=end) - pol.effective_date)
                              .dt.days.div(30.44).clip(lower=1))
    current = pol.groupby(["product", "region"]).apply(
        lambda g: np.average(g.annual_premium, weights=g.months_exposure),
        include_groups=False).rename("current_avg_premium").reset_index()
    profiles = profiles.merge(current, on=["product", "region"], how="left")
    profiles["adequacy_index"] = (profiles.indicated_gross_premium
                                  / profiles.current_avg_premium).round(3)
    profiles["rate_action"] = np.where(profiles.adequacy_index > 1.10, "Increase",
                                       np.where(profiles.adequacy_index < 0.90,
                                                "Decrease", "Hold"))

    OUT.mkdir(exist_ok=True)
    profiles.round(4).to_csv(OUT / "rate_factors.csv", index=False)
    summary = {
        "method": "frequency(severity) GLM pure-premium indication",
        "target_loss_ratio": TARGET_LR,
        "segments": int(len(profiles)),
        "increases": int((profiles.rate_action == "Increase").sum()),
        "decreases": int((profiles.rate_action == "Decrease").sum()),
        "max_adequacy_index": round(float(profiles.adequacy_index.max()), 3),
        "min_adequacy_index": round(float(profiles.adequacy_index.min()), 3),
        "portfolio_indicated_change_pct": round(float(
            (profiles.indicated_gross_premium * profiles.current_avg_premium).sum()
            / (profiles.current_avg_premium ** 2).sum() - 1) * 100, 2),
    }
    (OUT / "pricing_summary.json").write_text(json.dumps(summary, indent=2))
    log.info("Pricing indication complete → %s (%d segments, %d increases)",
             OUT / "rate_factors.csv", summary["segments"], summary["increases"])
    return summary


if __name__ == "__main__":
    main()
