"""Reference implementation of the medallion pipeline in pandas.

For small datasets (seed/demo scale) this reproduces exactly what the
spark/bronze, spark/silver and spark/gold jobs do — same tables, same
columns, same business rules — so the full lakehouse demo runs on a laptop
without a JVM. Point LAKEHOUSE_ROOT at s3a://lakehouse and the same code
reads/writes MinIO.

    python -m spark.pandas_reference
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common.config import DATA_END, get_logger, landing_path, layer_path
from common.io import read_jsonl_dir, write_parquet

log = get_logger("medallion.reference")

EXPENSE_RATIO = 0.15  # assumed management expense load


# ─────────────────────────────────────────────────────────────────────────────
# BRONZE — raw capture, add lineage metadata
# ─────────────────────────────────────────────────────────────────────────────
def bronze(dataset: str, source: str = "stream") -> pd.DataFrame:
    df = read_jsonl_dir(landing_path(source, dataset))
    if df.empty:
        log.warning("bronze/%s: no landing data found for source=%s", dataset, source)
        return df
    df["_loaded_at"] = pd.Timestamp.utcnow()
    df["_source"] = f"{source}/{dataset}"
    write_parquet(df, layer_path("bronze", dataset))
    log.info("bronze/%-12s %7d rows", dataset, len(df))
    return df


# ─────────────────────────────────────────────────────────────────────────────
# SILVER — typed, deduplicated, conformed
# ─────────────────────────────────────────────────────────────────────────────
def _dedupe_latest(df: pd.DataFrame, key: str) -> pd.DataFrame:
    return (df.sort_values(["_loaded_at"])
              .drop_duplicates(key, keep="last")
              .drop(columns=[c for c in ["_loaded_at", "_source", "_dt"] if c in df.columns]))


def silver_policies(bronze_dir: pd.DataFrame | None = None) -> pd.DataFrame:
    df = bronze_dir if bronze_dir is not None else bronze("policies", source="database")
    if df.empty:
        return df
    df = _dedupe_latest(df, "policy_id")
    df["effective_date"] = pd.to_datetime(df["effective_date"])
    df["expiry_date"] = pd.to_datetime(df["expiry_date"])
    df["annual_premium"] = df["annual_premium"].astype(float)
    df["sum_insured"] = df["sum_insured"].astype(float)
    df["churned"] = df["churned"].astype(int) if "churned" in df else 0
    for col, default in (("driver_aggressiveness", np.nan), ("finance_stress", 0.05)):
        if col not in df:
            df[col] = default
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df[df["status"].isin(["Active", "Renewed", "Lapsed", "Cancelled"])]
    write_parquet(df, layer_path("silver", "policies"))
    log.info("silver/policies    %7d rows", len(df))
    return df


def silver_customers(bronze_dir: pd.DataFrame | None = None) -> pd.DataFrame:
    df = bronze_dir if bronze_dir is not None else bronze("customers", source="database")
    if df.empty:
        return df
    df = _dedupe_latest(df, "customer_id")
    df["age"] = df["age"].astype(int)
    df["customer_since"] = pd.to_datetime(df["customer_since"])
    df["age_band"] = pd.cut(df["age"], [17, 25, 35, 50, 65, 200],
                            labels=["18-25", "26-35", "36-50", "51-65", "65+"])
    write_parquet(df, layer_path("silver", "customers"))
    log.info("silver/customers   %7d rows", len(df))
    return df


def silver_claims(bronze_dir: pd.DataFrame | None = None,
                  policies: pd.DataFrame | None = None) -> pd.DataFrame:
    df = bronze_dir if bronze_dir is not None else bronze("claims")
    if df.empty:
        return df
    df = _dedupe_latest(df, "claim_id")
    for col in ("loss_date", "report_date", "closed_date"):
        df[col] = pd.to_datetime(df[col])
    df["fraud_flag"] = df["fraud_flag"].astype(bool)
    if policies is not None and not policies.empty:
        df = df.merge(policies[["policy_id", "product", "region"]],
                      on="policy_id", how="left")
    write_parquet(df, layer_path("silver", "claims"))
    log.info("silver/claims      %7d rows", len(df))
    return df


def silver_payments(bronze_dir: pd.DataFrame | None = None) -> pd.DataFrame:
    df = bronze_dir if bronze_dir is not None else bronze("payments")
    if df.empty:
        return df
    df = _dedupe_latest(df, "payment_id")
    df["due_date"] = pd.to_datetime(df["due_date"])
    df["amount"] = df["amount"].astype(float)
    df = df[df["status"].isin(["Paid", "Failed", "Returned"]) & (df["amount"] > 0)]
    write_parquet(df, layer_path("silver", "payments"))
    log.info("silver/payments    %7d rows", len(df))
    return df


def silver_telematics(bronze_dir: pd.DataFrame | None = None) -> pd.DataFrame:
    df = bronze_dir if bronze_dir is not None else bronze("telematics")
    if df.empty:
        return df
    df = _dedupe_latest(df, "ping_id")
    df["ping_ts"] = pd.to_datetime(df["ping_ts"])
    df["speed_kph"] = df["speed_kph"].astype(float).clip(0, 200)
    for col in ("harsh_braking", "harsh_accel", "night_trip"):
        df[col] = df[col].astype(bool)
    df = df[df["odometer_km"] >= 0]
    write_parquet(df, layer_path("silver", "telematics"))
    log.info("silver/telematics  %7d rows", len(df))
    return df


# ─────────────────────────────────────────────────────────────────────────────
# GOLD — analytics marts
# ─────────────────────────────────────────────────────────────────────────────
def gold_telematics_behavior(tel: pd.DataFrame | None = None) -> pd.DataFrame:
    if tel is None or tel.empty:
        return pd.DataFrame()
    g = tel.groupby("policy_id").agg(
        pings=("ping_id", "count"),
        mileage_km=("odometer_km", lambda s: float(s.max() - s.min()) if len(s) > 1 else 0.0),
        harsh_braking_rate=("harsh_braking", "mean"),
        harsh_accel_rate=("harsh_accel", "mean"),
        night_rate=("night_trip", "mean"),
        avg_speed_kph=("speed_kph", "mean"),
    ).reset_index()
    g["driving_score"] = np.clip(
        100 * (1 - 2.2 * g.harsh_braking_rate - 1.4 * g.harsh_accel_rate
               - 0.35 * g.night_rate), 5, 100).round(1)
    write_parquet(g, layer_path("gold", "telematics_behavior"))
    log.info("gold/telematics_behavior %5d rows", len(g))
    return g


def gold_policy_performance(policies: pd.DataFrame, claims: pd.DataFrame,
                            behavior: pd.DataFrame | None) -> pd.DataFrame:
    end = pd.Timestamp(DATA_END)
    p = policies.copy()
    p["months_exposure"] = (((p.expiry_date.clip(upper=end) - p.effective_date)
                             .dt.days / 30.44).clip(lower=1)).round(1)
    if not claims.empty:
        agg = claims.groupby("policy_id").agg(
            n_claims=("claim_id", "count"),
            incurred=("claim_amount", "sum"),
            paid=("paid_amount", "sum"),
            open_claims=("status", lambda s: int((s == "Open").sum())),
            fraud_claims=("fraud_flag", "sum"),
        ).reset_index()
        p = p.merge(agg, on="policy_id", how="left")
    else:
        for c in ("n_claims", "incurred", "paid", "open_claims", "fraud_claims"):
            p[c] = 0
    p[[c for c in ("n_claims", "incurred", "paid", "open_claims", "fraud_claims")]] = \
        p[[c for c in ("n_claims", "incurred", "paid", "open_claims", "fraud_claims")]].fillna(0)
    p["earned_premium"] = (p.annual_premium * p.months_exposure / 12).round(2)
    p["loss_ratio"] = (p.incurred / p.earned_premium.replace(0, np.nan)).clip(upper=5).round(4)
    if behavior is not None and not behavior.empty:
        p = p.merge(behavior[["policy_id", "driving_score"]], on="policy_id", how="left")
    else:
        p["driving_score"] = np.nan

    def tier(row) -> int:
        ds = row.get("driving_score")
        if pd.notna(ds) and ds < 45:
            return 5
        if row["n_claims"] >= 3:
            return 5
        if row["n_claims"] == 2 or (pd.notna(ds) and ds < 60):
            return 4
        if row["n_claims"] == 1:
            return 3
        return 2 if (pd.notna(ds) and ds < 75) else 1

    p["risk_tier"] = p.apply(tier, axis=1)
    keep = ["policy_id", "customer_id", "product", "sub_product", "region",
            "distribution_channel", "effective_date", "expiry_date", "status",
            "annual_premium", "sum_insured", "months_exposure", "earned_premium",
            "n_claims", "open_claims", "fraud_claims", "incurred", "paid",
            "loss_ratio", "driving_score", "risk_tier", "churned"]
    p = p[keep]
    write_parquet(p, layer_path("gold", "policy_performance"))
    log.info("gold/policy_performance %5d rows", len(p))
    return p


def gold_claims_daily(claims: pd.DataFrame) -> pd.DataFrame:
    if claims.empty:
        return pd.DataFrame()
    g = (claims.groupby([claims.loss_date.dt.date.rename("loss_date"),
                         "product", "region"])
         .agg(n_claims=("claim_id", "count"), incurred=("claim_amount", "sum"),
              paid=("paid_amount", "sum")).reset_index())
    write_parquet(g, layer_path("gold", "claims_daily"))
    log.info("gold/claims_daily    %6d rows", len(g))
    return g


def gold_customer_360(customers: pd.DataFrame, policies: pd.DataFrame,
                      claims: pd.DataFrame, payments: pd.DataFrame) -> pd.DataFrame:
    if customers.empty:
        return pd.DataFrame()
    end = pd.Timestamp(DATA_END)
    pol = policies.groupby("customer_id").agg(
        n_policies=("policy_id", "count"),
        total_premium=("annual_premium", "sum"),
        churned=("churned", "max")).reset_index()
    cl = claims.merge(policies[["policy_id", "customer_id"]], on="policy_id") \
        .groupby("customer_id").agg(n_claims=("claim_id", "count"),
                                    open_claims=("status",
                                                 lambda s: int((s == "Open").sum()))).reset_index()
    fails = payments.merge(policies[["policy_id", "customer_id"]], on="policy_id")
    fails = (fails[fails.status != "Paid"].groupby("customer_id")
             .size().rename("payment_failures").reset_index())
    out = customers.merge(pol, on="customer_id", how="left") \
        .merge(cl, on="customer_id", how="left") \
        .merge(fails, on="customer_id", how="left")
    for c in ("n_policies", "total_premium", "churned", "n_claims", "open_claims",
              "payment_failures"):
        if c not in out:
            out[c] = 0
        out[c] = out[c].fillna(0)
    out["tenure_months"] = ((end - out.customer_since).dt.days / 30.44).round(1)
    out["clv_estimate"] = (out.total_premium * 1.6 - out.n_claims * 3000).round(2)
    out = out[["customer_id", "name", "age_band", "region", "tenure_months",
               "n_policies", "total_premium", "n_claims", "open_claims",
               "payment_failures", "churned", "clv_estimate"]]
    write_parquet(out, layer_path("gold", "customer_360"))
    log.info("gold/customer_360    %6d rows", len(out))
    return out


def gold_fraud_scores(claims: pd.DataFrame, alerts: pd.DataFrame | None) -> pd.DataFrame:
    if claims.empty:
        return pd.DataFrame()
    f = claims[claims.fraud_flag | claims.fraud_probability.notna()][
        ["claim_id", "fraud_probability", "fraud_flag", "report_date"]].copy()
    if alerts is not None and not alerts.empty:
        f = f.merge(alerts[["claim_id", "siu_outcome"]], on="claim_id", how="left")
    else:
        f["siu_outcome"] = None
    # quantile-based triage: High = top 5%, Medium = next 10% of the score mix
    q95 = f.fraud_probability.quantile(0.95)
    q85 = f.fraud_probability.quantile(0.85)
    f["alert_priority"] = np.where(f.fraud_probability >= q95, "High",
                                   np.where(f.fraud_probability >= q85, "Medium", "Low"))
    write_parquet(f, layer_path("gold", "fraud_scores"))
    log.info("gold/fraud_scores     %6d rows", len(f))
    return f


def gold_portfolio_kpis(policies: pd.DataFrame, claims: pd.DataFrame) -> pd.DataFrame:
    end = pd.Timestamp(DATA_END)
    # policy-months: one row per (policy, calendar month in force)
    frames = []
    for rec in policies.itertuples(index=False):
        m_end = min(rec.expiry_date, end)
        months = pd.date_range(rec.effective_date.to_period("M").to_timestamp(),
                               m_end.to_period("M").to_timestamp(), freq="MS")
        if len(months):
            frames.append(pd.DataFrame({
                "policy_id": rec.policy_id, "product": rec.product, "month": months,
                "monthly_premium": rec.annual_premium / 12}))
    if not frames:
        return pd.DataFrame()
    pm = pd.concat(frames, ignore_index=True)
    cl = claims.copy()
    cl["month"] = cl.loss_date.dt.to_period("M").dt.to_timestamp()
    cagg = cl.groupby(["product", "month"]).agg(
        n_claims=("claim_id", "count"), incurred=("claim_amount", "sum"),
        paid=("paid_amount", "sum"), fraud=("fraud_flag", "sum")).reset_index()
    pagg = pm.groupby(["product", "month"]).agg(
        policies_inforce=("policy_id", "count"), earned_premium=("monthly_premium", "sum")).reset_index()
    kpi = pagg.merge(cagg, on=["product", "month"], how="left")
    for c in ("n_claims", "incurred", "paid", "fraud"):
        kpi[c] = kpi[c].fillna(0)
    gwp = (policies.assign(month=policies.effective_date.dt.to_period("M").dt.to_timestamp())
           .groupby(["product", "month"], as_index=False)
           .agg(gwp=("annual_premium", "sum")))
    kpi = kpi.merge(gwp, on=["product", "month"], how="left")
    kpi["gwp"] = kpi.gwp.fillna(0.0)
    kpi["claim_frequency"] = (kpi.n_claims / kpi.policies_inforce).round(4)
    kpi["avg_severity"] = (kpi.incurred / kpi.n_claims.replace(0, np.nan)).round(2)
    kpi["loss_ratio"] = (kpi.incurred / kpi.earned_premium.replace(0, np.nan)).round(4)
    kpi["expense_ratio"] = EXPENSE_RATIO
    kpi["combined_ratio"] = (kpi.loss_ratio.fillna(0) + EXPENSE_RATIO).round(4)
    kpi["fraud_rate"] = (kpi.fraud / kpi.n_claims.replace(0, np.nan)).round(4)
    kpi["month"] = kpi.month.dt.strftime("%Y-%m")
    kpi = kpi[["month", "product", "policies_inforce", "gwp", "earned_premium",
               "n_claims", "claim_frequency", "avg_severity", "incurred", "paid",
               "loss_ratio", "expense_ratio", "combined_ratio", "fraud_rate"]]
    write_parquet(kpi, layer_path("gold", "portfolio_kpis"))
    log.info("gold/portfolio_kpis   %6d rows", len(kpi))
    return kpi


# ─────────────────────────────────────────────────────────────────────────────
def run_all() -> None:
    log.info("── bronze ──")
    pol_b, cus_b = bronze("policies", "database"), bronze("customers", "database")
    clm_b, pay_b = bronze("claims"), bronze("payments")
    tel_b, frd_b = bronze("telematics"), bronze("fraud")

    log.info("── silver ──")
    policies = silver_policies(pol_b)
    customers = silver_customers(cus_b)
    claims = silver_claims(clm_b, policies)
    payments = silver_payments(pay_b)
    telematics = silver_telematics(tel_b)
    if not frd_b.empty:  # keep alerts for the fraud mart
        frd_b = _dedupe_latest(frd_b, "alert_id")
        write_parquet(frd_b, layer_path("silver", "fraud_alerts"))

    log.info("── gold ──")
    behavior = gold_telematics_behavior(telematics)
    perf = gold_policy_performance(policies, claims, behavior)
    gold_claims_daily(claims)
    gold_customer_360(customers, policies, claims, payments)
    alerts = frd_b if not frd_b.empty else None
    gold_fraud_scores(claims, alerts)
    kpis = gold_portfolio_kpis(policies, claims)
    log.info("Medallion reference pipeline complete ✔")
    return {"performance": perf, "kpis": kpis}


if __name__ == "__main__":
    run_all()
