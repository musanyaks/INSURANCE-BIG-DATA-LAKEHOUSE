"""Pricing adequacy review — actual vs target loss ratio by segment.

    python -m actuarial.pricing.pricing_adequacy
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from common.config import DATA_END, get_logger
from common.datasets import load_claims, load_gold, load_policies

log = get_logger("actuarial.adequacy")
OUT = Path(__file__).resolve().parent / "output"
TARGET_LR = 0.68


def main() -> dict:
    perf = load_gold("policy_performance")
    if perf is None or perf.empty:
        policies, claims = load_policies(), load_claims()
        if policies is None:
            log.error("No data available.")
            return {}
        end = pd.Timestamp(DATA_END)
        policies = policies.copy()
        policies["months_exposure"] = ((policies.expiry_date.clip(upper=end)
                                        - policies.effective_date).dt.days / 30.44).clip(1)
        policies["earned_premium"] = policies.annual_premium * policies.months_exposure / 12
        counts = claims.groupby("policy_id").claim_amount.sum() if claims is not None else pd.Series(dtype=float)
        policies["incurred"] = policies.policy_id.map(counts).fillna(0.0)
        perf = policies

    g = (perf.groupby(["product", "region"])
         .agg(policies=("policy_id", "count"), earned=("earned_premium", "sum"),
              incurred=("incurred", "sum"), claims=("n_claims", "sum"))
         .reset_index())
    g["actual_loss_ratio"] = (g.incurred / g.earned).round(4)
    g["target_loss_ratio"] = TARGET_LR
    g["adequacy_index"] = (g.actual_loss_ratio / TARGET_LR).round(3)
    g["rate_action"] = np.where(g.adequacy_index > 1.10, "Increase",
                                np.where(g.adequacy_index < 0.85, "Decrease", "Hold"))
    g = g.sort_values("adequacy_index", ascending=False)

    OUT.mkdir(exist_ok=True)
    g.to_csv(OUT / "adequacy_by_segment.csv", index=False)
    summary = {
        "method": "actual-vs-target loss ratio (68%) by product × region",
        "segments": int(len(g)),
        "under_priced": int((g.rate_action == "Increase").sum()),
        "over_priced": int((g.rate_action == "Decrease").sum()),
        "worst_segment": {"product": g.iloc[0]["product"], "region": g.iloc[0]["region"],
                          "loss_ratio": float(g.iloc[0]["actual_loss_ratio"])},
        "best_segment": {"product": g.iloc[-1]["product"], "region": g.iloc[-1]["region"],
                         "loss_ratio": float(g.iloc[-1]["actual_loss_ratio"])},
        "portfolio_loss_ratio": round(float(g.incurred.sum() / g.earned.sum()), 4),
    }
    (OUT / "adequacy_summary.json").write_text(json.dumps(summary, indent=2))
    log.info("Adequacy review: portfolio LR %.1f%%, %d segments need a rate increase",
             100 * summary["portfolio_loss_ratio"], summary["under_priced"])
    return summary


if __name__ == "__main__":
    main()
