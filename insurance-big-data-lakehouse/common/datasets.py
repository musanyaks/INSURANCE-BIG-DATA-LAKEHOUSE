"""High-level dataset loaders used by the actuarial and ML modules.

Lakehouse-first (silver/gold parquet or Delta), with automatic fallback to the
deterministic seed CSVs in data/seed so analytics always run — even before the
Spark jobs have executed. All loaders return typed pandas DataFrames.
"""
from __future__ import annotations

import pandas as pd

from common.config import SEED_DIR, get_logger, layer_path
from common.io import read_csv, read_table

log = get_logger("datasets")


def _try_lakehouse(layer: str, dataset: str) -> pd.DataFrame | None:
    try:
        return read_table(layer_path(layer, dataset))
    except Exception:
        return None


def _seed(name: str) -> pd.DataFrame | None:
    try:
        return read_csv(SEED_DIR / f"{name}.csv")
    except Exception:
        return None


def _first(*dfs: pd.DataFrame | None) -> pd.DataFrame | None:
    """Return the first non-None, non-empty frame (fallback chain)."""
    for d in dfs:
        if d is not None and not d.empty:
            return d
    return next((d for d in dfs if d is not None), None)


def load_policies() -> pd.DataFrame | None:
    df = _first(_try_lakehouse("silver", "policies"), _seed("policies"))
    if df is None:
        return None
    for col in ("effective_date", "expiry_date"):
        df[col] = pd.to_datetime(df[col])
    if "driver_aggressiveness" not in df:
        df["driver_aggressiveness"] = float("nan")
    if "finance_stress" not in df:
        df["finance_stress"] = 0.05
    return df


def load_claims() -> pd.DataFrame | None:
    df = _first(_try_lakehouse("silver", "claims"), _seed("claims"))
    if df is None:
        return None
    for col in ("loss_date", "report_date", "closed_date"):
        if col in df:
            df[col] = pd.to_datetime(df[col])
    if "fraud_flag" in df:
        df["fraud_flag"] = df["fraud_flag"].astype(bool)
    return df


def load_customers() -> pd.DataFrame | None:
    df = _first(_try_lakehouse("silver", "customers"), _seed("customers"))
    if df is None:
        return None
    df["customer_since"] = pd.to_datetime(df["customer_since"])
    if "age_band" not in df:
        df["age_band"] = pd.cut(df["age"], [17, 25, 35, 50, 65, 200],
                                labels=["18-25", "26-35", "36-50", "51-65", "65+"])
    return df


def load_payments() -> pd.DataFrame | None:
    df = _first(_try_lakehouse("silver", "payments"), _seed("payments"))
    if df is None:
        return None
    df["due_date"] = pd.to_datetime(df["due_date"])
    return df


def load_telematics() -> pd.DataFrame | None:
    return _first(_try_lakehouse("silver", "telematics"), _seed("telematics"))


def load_fraud_alerts() -> pd.DataFrame | None:
    return _first(_try_lakehouse("silver", "fraud_alerts"), _seed("fraud_alerts"))


def load_gold(dataset: str) -> pd.DataFrame | None:
    return _try_lakehouse("gold", dataset)


def load_driving_scores() -> pd.Series | None:
    """policy_id → driving_score from the gold telematics mart (if present)."""
    beh = load_gold("telematics_behavior")
    if beh is None and _try_lakehouse("silver", "telematics") is None:
        return None
    if beh is None:
        from spark.pandas_reference import gold_telematics_behavior
        beh = gold_telematics_behavior(load_telematics())
    if beh is None or beh.empty:
        return None
    return beh.set_index("policy_id")["driving_score"]
