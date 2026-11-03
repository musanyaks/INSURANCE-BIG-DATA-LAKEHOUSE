"""Fraud feature engineering — one row per claim, model-ready.

    from ml.fraud.build_features import build_fraud_features
    X, y = build_fraud_features()
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common.datasets import load_claims, load_driving_scores, load_payments, load_policies

INJURY_PERILS = {"Third-Party Injury", "Liability", "Burglary"}


def build_fraud_features() -> tuple[pd.DataFrame, pd.Series] | None:
    claims, policies = load_claims(), load_policies()
    if claims is None or claims.empty or policies is None:
        return None
    if "fraud_flag" not in claims or claims.fraud_flag.nunique() < 2:
        return None

    df = claims[["claim_id", "policy_id", "claim_amount", "reported_lag_days",
                 "prior_claims", "night_indicator", "peril", "fraud_flag"]].copy()

    # payment behaviour of the underlying policy
    payments = load_payments()
    if payments is not None:
        fails = payments[payments.status != "Paid"].groupby("policy_id").size()
        totals = payments.groupby("policy_id").size()
        fail_rate = (df.policy_id.map(fails).fillna(0)
                     / df.policy_id.map(totals).fillna(1).replace(0, 1))
        df["payment_failure_rate"] = fail_rate.values
    else:
        df["payment_failure_rate"] = 0.0

    pol = policies.set_index("policy_id")
    df["log_claim_amount"] = np.log1p(df.claim_amount)
    df["is_injury_peril"] = df.peril.isin(INJURY_PERILS).astype(int)
    df["night_indicator"] = df.night_indicator.astype(int)
    df["log_premium"] = np.log1p(df.policy_id.map(pol.annual_premium))
    df["product"] = df.policy_id.map(pol["product"])

    scores = load_driving_scores()
    if scores is not None:
        df["driving_score"] = df.policy_id.map(scores).fillna(scores.median())
    else:
        df["driving_score"] = 75.0

    df["fraud_flag"] = df.fraud_flag.astype(int)
    y = df.pop("fraud_flag")
    return df, y
