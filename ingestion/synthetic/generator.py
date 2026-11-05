"""Synthetic insurance data generator for Meridian Mutual.

Produces a realistic synthetic book of business with the properties that make
downstream pipelines interesting:

  * seasonality      – motor claims peak in winter, home claims in storm season
  * latent risk      – each motor policy has a latent driver aggressiveness
                       that raises both claim frequency and telematics noise
  * fraud signal     – fraud probability rises with severity percentile,
                       reporting lag, prior claims, night/injury perils and
                       premium payment failures (learnable by ML models)
  * churn signal     – lapses correlate with payment failures and claims count

Scales
------
  seed  ~240 policies   → deterministic CSVs in data/seed (used by tests/CI)
  demo  ~8,000 policies → JSONL landing zone under lakehouse/landing
  full  ~50,000 policies→ same layout, bigger volumes

Usage
-----
    python -m ingestion.synthetic.generator --scale demo
"""
from __future__ import annotations

import argparse
import json
from datetime import date, timedelta

import numpy as np
import pandas as pd

from common.config import DATA_END, DATA_START, SEED_DIR, get_logger, landing_path
from common.io import write_csv, write_json, write_jsonl

log = get_logger("generator")

RNG = np.random.default_rng(20260101)

REGIONS = ["North", "South", "East", "West", "Central"]
REGION_W = [0.22, 0.24, 0.18, 0.16, 0.20]
PRODUCTS = ["Motor", "Home", "Health"]
PROD_W = [0.55, 0.30, 0.15]
CHANNELS = ["Direct", "Agent", "Broker", "Online"]
CH_W = [0.34, 0.28, 0.20, 0.18]
SUBPRODUCTS = {
    "Motor": ["Comprehensive", "TPFT", "Third Party"],
    "Home": ["Buildings", "Contents", "Combined"],
    "Health": ["Individual", "Family"],
}
SUB_W = {"Motor": [0.52, 0.28, 0.20], "Home": [0.50, 0.25, 0.25], "Health": [0.60, 0.40]}
PERILS = {
    "Motor": ["Collision", "Theft", "Windscreen", "Fire", "Third-Party Injury"],
    "Home": ["Storm", "Water Damage", "Fire", "Burglary", "Liability"],
    "Health": ["Outpatient", "Surgery", "Chronic Care", "Emergency"],
}
PERIL_W = {"Motor": [0.52, 0.14, 0.20, 0.06, 0.08],
           "Home": [0.30, 0.25, 0.08, 0.22, 0.15],
           "Health": [0.45, 0.20, 0.15, 0.20]}
SEVERITY = {  # (mean, sigma) of lognormal claim cost, USD
    "Collision": (3200, 0.95), "Theft": (4800, 0.90), "Windscreen": (620, 0.55),
    "Fire": (9500, 1.00), "Third-Party Injury": (18500, 1.10),
    "Storm": (7800, 0.95), "Water Damage": (5200, 0.85), "Burglary": (3800, 0.80),
    "Liability": (12000, 1.05),
    "Outpatient": (850, 0.60), "Surgery": (6500, 0.90), "Chronic Care": (3200, 0.80),
    "Emergency": (2600, 0.75),
}
# Home fire shares the 'Fire' peril with motor; disambiguate via product below.
BASE_FREQ = {"Motor": 0.130, "Home": 0.055, "Health": 0.240}
MONTH_SEASONALITY = {
    "Motor": [1.35, 1.30, 1.15, 1.00, 0.90, 0.85, 0.90, 0.90, 1.00, 1.10, 1.20, 1.40],
    "Home": [1.30, 1.10, 0.95, 0.85, 0.80, 0.90, 1.05, 1.15, 1.00, 0.95, 1.00, 1.25],
    "Health": [1.0] * 12,
}
INFLATION = {2024: 1.00, 2025: 1.08, 2026: 1.15}
PREMIUM_BASE = {"Motor": 850.0, "Home": 620.0, "Health": 1450.0}
FIRST_NAMES = ["Ava", "Liam", "Noah", "Emma", "Olivia", "Kwame", "Zara", "Hiro", "Ines",
               "Tariq", "Maya", "Elena", "Peter", "Sofia", "Jonas", "Amara", "Felix",
               "Nadia", "Oscar", "Lucia"]
LAST_NAMES = ["Mwangi", "Okafor", "Silva", "Novak", "Tanaka", "Muller", "Rossi", "Kaur",
              "Haddad", "Osei", "Kimani", "Dubois", "Andersson", "Costa", "Nguyen",
              "Ibrahim", "Fernandez", "Kovacs", "Mensah", "Petit"]

SCALES = {
    "seed": {"policies": 240, "telematics_budget": 1_500},
    "demo": {"policies": 8_000, "telematics_budget": 200_000},
    "full": {"policies": 50_000, "telematics_budget": 1_200_000},
}


def _pick(n: int, values: list, weights: list) -> np.ndarray:
    return RNG.choice(values, size=n, p=weights)


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


def build_customers(n: int) -> pd.DataFrame:
    first = _pick(n, FIRST_NAMES, [1 / len(FIRST_NAMES)] * len(FIRST_NAMES))
    last = _pick(n, LAST_NAMES, [1 / len(LAST_NAMES)] * len(LAST_NAMES))
    return pd.DataFrame({
        "customer_id": [f"C{i:06d}" for i in range(1, n + 1)],
        "name": [f"{a} {b}" for a, b in zip(first, last)],
        "age": np.clip(RNG.normal(44, 15, n), 18, 84).astype(int),
        "region": _pick(n, REGIONS, REGION_W),
        "customer_since": [DATA_START - timedelta(days=int(d))
                           for d in RNG.uniform(0, 1400, n)],
        "credit_band": _pick(n, ["A", "B", "C"], [0.45, 0.40, 0.15]),
    })


def build_policies(customers: pd.DataFrame, n: int) -> pd.DataFrame:
    idx = RNG.integers(0, len(customers), n)
    product = _pick(n, PRODUCTS, PROD_W)
    sub = np.array([RNG.choice(SUBPRODUCTS[p], p=SUB_W[p]) for p in product])
    window_days = (DATA_END - DATA_START).days - 30
    eff = np.array([DATA_START + timedelta(days=int(d))
                    for d in RNG.beta(1.35, 1.0, n) * window_days])
    premium = np.array([
        RNG.lognormal(np.log(PREMIUM_BASE[p]), 0.38) * (1 + 0.05 * (REGIONS.index(r) - 2) / 2)
        for p, r in zip(product, customers.region.iloc[idx])
    ]).round(2)
    sum_insured = np.where(product == "Motor", RNG.uniform(4_000, 60_000, n),
                           np.where(product == "Home", RNG.uniform(100_000, 800_000, n),
                                    RNG.uniform(50_000, 500_000, n))).round(0)
    df = pd.DataFrame({
        "policy_id": [f"P{i:06d}" for i in range(1, n + 1)],
        "customer_id": customers.customer_id.iloc[idx].values,
        "product": product,
        "sub_product": sub,
        "region": customers.region.iloc[idx].values,
        "distribution_channel": _pick(n, CHANNELS, CH_W),
        "effective_date": eff,
        "expiry_date": eff + timedelta(days=365),
        "annual_premium": premium,
        "sum_insured": sum_insured,
        # latent driver aggressiveness (Motor only) — drives frequency + telematics
        "driver_aggressiveness": np.where(product == "Motor", RNG.beta(2.0, 5.0, n), np.nan),
        "finance_stress": RNG.beta(1.5, 9.0, n),  # drives payment failures + churn
    })
    return df


def build_payments(policies: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for rec in policies.itertuples(index=False):
        end = min(rec.expiry_date, DATA_END)
        n_months = max(1, (end - rec.effective_date).days // 30)
        p_fail = float(np.clip(0.008 + 0.55 * rec.finance_stress, 0.005, 0.22))
        fails = RNG.random(n_months) < p_fail
        for m in range(n_months):
            due = rec.effective_date + timedelta(days=30 * m)
            if due > DATA_END:
                break
            rows.append((
                f"PAY{len(rows):08d}", rec.policy_id, due, round(rec.annual_premium / 12, 2),
                "Failed" if fails[m] else ("Returned" if (fails[m] and RNG.random() < 0.3) else "Paid"),
                RNG.choice(["Direct Debit", "Card", "Online"], p=[0.5, 0.3, 0.2]),
            ))
    return pd.DataFrame(rows, columns=["payment_id", "policy_id", "due_date", "amount",
                                       "status", "method"])


def build_claims_and_alerts(policies: pd.DataFrame, payments: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    fail_rate = (payments.assign(fail=payments.status.ne("Paid").astype(int))
                 .groupby("policy_id").fail.mean())
    policy_ids, loss_dates, perils, severities, night = [], [], [], [], []
    for rec in policies.itertuples(index=False):
        expo = max(0.08, ((min(rec.expiry_date, DATA_END) - rec.effective_date).days) / 365.0)
        lam = BASE_FREQ[rec.product] * expo
        if rec.product == "Motor" and not np.isnan(rec.driver_aggressiveness):
            lam *= float(np.exp(0.9 * (rec.driver_aggressiveness - 0.4)))
        n_claims = RNG.poisson(lam)
        if n_claims == 0:
            continue
        w = np.array(MONTH_SEASONALITY[rec.product]) / sum(MONTH_SEASONALITY[rec.product])
        months = RNG.choice(12, size=n_claims, p=w)
        for m in months:
            day = int(RNG.integers(1, 29))
            loss = date(rec.effective_date.year + (rec.effective_date.month - 1 + int(m)) // 12,
                        (rec.effective_date.month - 1 + int(m)) % 12 + 1, day)
            if loss > DATA_END:
                continue
            peril = RNG.choice(PERILS[rec.product], p=PERIL_W[rec.product])
            policy_ids.append(rec.policy_id)
            loss_dates.append(loss)
            perils.append(str(peril))
            night.append(bool(RNG.random() < (0.45 if peril in ("Third-Party Injury", "Theft",
                                                               "Burglary", "Liability") else 0.18)))
            infl_f = INFLATION[loss.year]
            mean, sigma = SEVERITY[peril]
            # lognormal parameterised so that E[X] = mean * inflation exactly
            mu = np.log(mean * infl_f) - 0.5 * sigma ** 2
            severities.append(float(RNG.lognormal(mu, sigma)))
    claims = pd.DataFrame({
        "claim_id": [f"CL{i:06d}" for i in range(1, len(policy_ids) + 1)],
        "policy_id": policy_ids,
        "loss_date": loss_dates,
        "peril": perils,
        "claim_amount": np.round(severities, 2),
        "night_indicator": night,
    })
    if claims.empty:
        return claims, pd.DataFrame()

    claims = claims.sort_values("loss_date").reset_index(drop=True)
    claims["prior_claims"] = claims.groupby("policy_id").cumcount()
    claims["reported_lag_days"] = np.ceil(
        RNG.gamma(2.0, 4.0, len(claims)) + 1).astype(int)
    claims["report_date"] = [d + timedelta(days=int(lag))
                             for d, lag in zip(claims.loss_date, claims.reported_lag_days)]
    claims["severity_pct"] = claims.groupby("peril").claim_amount.rank(pct=True)
    closed = RNG.random(len(claims)) < 0.78
    claims["status"] = np.where(closed, "Closed", "Open")
    claims["paid_amount"] = np.where(
        closed, np.round(claims.claim_amount * RNG.uniform(0.75, 1.0, len(claims)), 2),
        np.round(claims.claim_amount * RNG.uniform(0.0, 0.4, len(claims)), 2))
    claims["reserve_amount"] = np.where(
        closed, 0.0, np.round(claims.claim_amount - claims.paid_amount, 2))
    claims["closed_date"] = [
        d + timedelta(days=int(x)) if c else None
        for d, c, x in zip(claims.report_date, closed, RNG.uniform(20, 240, len(claims)))]

    pol = policies.set_index("policy_id")
    fr = claims.policy_id.map(fail_rate).fillna(0.0).values
    agg = claims.policy_id.map(pol.driver_aggressiveness).fillna(0.35).values
    injury = claims.peril.isin(["Third-Party Injury", "Liability", "Burglary"]).astype(float)
    z = (-6.40 + 3.00 * claims.severity_pct + 1.40 * (claims.reported_lag_days > 21)
         + 0.10 * np.clip(claims.reported_lag_days, 0, 30)
         + 0.90 * np.minimum(claims.prior_claims, 3) + 0.60 * injury
         + 0.90 * np.sqrt(np.clip(fr, 0, 1)) + 0.50 * agg)
    fraud_p = _sigmoid(z.values)
    claims["fraud_flag"] = RNG.random(len(claims)) < fraud_p
    claims["fraud_probability"] = np.round(fraud_p, 4)

    alerts = claims[claims.fraud_probability > np.quantile(fraud_p, 0.92)].copy()
    alerts = pd.DataFrame({
        "alert_id": [f"FA{i:05d}" for i in range(1, len(alerts) + 1)],
        "claim_id": alerts.claim_id.values,
        "alert_date": [d + timedelta(days=2) for d in alerts.report_date],
        "alert_score": np.round(np.clip(alerts.fraud_probability + RNG.normal(0, 0.05, len(alerts)), 0, 1), 4),
        "siu_outcome": np.where(
            alerts.fraud_flag,
            RNG.choice(["Confirmed Fraud", "Substantiated", "Cleared"], len(alerts), p=[0.55, 0.30, 0.15]),
            RNG.choice(["Cleared", "Under Review"], len(alerts), p=[0.80, 0.20])),
    })
    return claims, alerts


def build_telematics(policies: pd.DataFrame, budget: int) -> pd.DataFrame:
    motor = policies[policies["product"] == "Motor"]
    if motor.empty or budget <= 0:
        return pd.DataFrame()
    # riskier drivers generate more trips
    weights = 0.4 + motor.driver_aggressiveness.fillna(0.4).values
    take = min(len(motor), max(1, budget // 30))
    chosen = RNG.choice(len(motor), size=take, replace=False, p=weights / weights.sum())
    pings_per = np.minimum(RNG.integers(10, 45, take),
                           np.maximum(1, budget // take))
    rows = []
    for pos, n in zip(chosen, pings_per):
        rec = motor.iloc[pos]
        a = rec.driver_aggressiveness
        base_ts = pd.Timestamp(DATA_START) + pd.to_timedelta(
            RNG.uniform(0, (DATA_END - DATA_START).days, n), unit="D")
        odom = 0.0
        for ts in sorted(base_ts):
            odom += RNG.uniform(8, 90)
            rows.append((
                f"T{len(rows):08d}", rec.policy_id,
                ts.to_pydatetime() + timedelta(minutes=int(RNG.integers(6 * 60, 22 * 60))),
                float(np.clip(RNG.normal(52, 18), 0, 165)),
                bool(RNG.random() < 0.02 + 0.14 * a),
                bool(RNG.random() < 0.02 + 0.10 * a),
                bool(RNG.random() < 0.22),
                round(odom, 1),
            ))
    return pd.DataFrame(rows, columns=["ping_id", "policy_id", "ping_ts", "speed_kph",
                                       "harsh_braking", "harsh_accel", "night_trip",
                                       "odometer_km"])


def finalize_status(policies: pd.DataFrame, claims: pd.DataFrame) -> pd.DataFrame:
    n_claims = claims.groupby("policy_id").size() if not claims.empty else pd.Series(dtype=int)
    matured = policies.expiry_date <= DATA_END
    p_lapse = _sigmoid((-2.9 + 6.0 * policies.finance_stress
                        + 0.8 * policies.policy_id.map(n_claims).fillna(0).ge(2).astype(int)).values)
    r = RNG.random(len(policies))
    status = np.where(matured, "Renewed", "Active")
    status = np.where(matured & (r < p_lapse), "Lapsed", status)
    status = np.where(matured & (r >= p_lapse) & (r < p_lapse + 0.05), "Cancelled", status)
    policies = policies.copy()
    policies["status"] = status
    policies["churned"] = np.isin(status, ["Lapsed", "Cancelled"]).astype(int)
    return policies


# ── Output helpers ───────────────────────────────────────────────────────────
def _partitioned_jsonl(df: pd.DataFrame, source: str, dataset: str, date_col: str) -> int:
    if df.empty:
        return 0
    df = df.copy()
    df["_dt"] = pd.to_datetime(df[date_col]).dt.strftime("%Y-%m-%d")
    n = 0
    for dt, chunk in df.groupby("_dt"):
        chunk = chunk.drop(columns="_dt")
        chunk = chunk.copy()
        for col in chunk.columns:
            if str(chunk[col].dtype).startswith("datetime"):
                chunk[col] = chunk[col].dt.strftime("%Y-%m-%dT%H:%M:%S")
            elif chunk[col].dtype == object:
                chunk[col] = chunk[col].apply(
                    lambda v: v.isoformat() if isinstance(v, (pd.Timestamp,)) else v)
        write_jsonl(chunk.to_dict("records"),
                    f"{landing_path(source, dataset)}/dt={dt}/part-0000.jsonl")
        n += len(chunk)
    return n


def _emit_landing(policies, customers, claims, alerts, payments, telematics) -> dict:
    counts = {}
    counts["policies"] = _partitioned_jsonl(policies, "database", "policies", "effective_date")
    counts["customers"] = _partitioned_jsonl(customers, "database", "customers", "customer_since")
    if not claims.empty:
        counts["claims"] = _partitioned_jsonl(claims, "stream", "claims", "report_date")
        counts["fraud_alerts"] = _partitioned_jsonl(alerts, "stream", "fraud", "alert_date")
    counts["payments"] = _partitioned_jsonl(payments, "stream", "payments", "due_date")
    if not telematics.empty:
        counts["telematics"] = _partitioned_jsonl(telematics, "stream", "telematics", "ping_ts")
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description="Meridian synthetic data generator")
    ap.add_argument("--scale", choices=list(SCALES), default="demo")
    args = ap.parse_args()
    cfg = SCALES[args.scale]

    n_cust = int(cfg["policies"] * 0.75)
    log.info("Generating scale=%s …", args.scale)
    customers = build_customers(n_cust)
    policies = build_policies(customers, cfg["policies"])
    payments = build_payments(policies)
    claims, alerts = build_claims_and_alerts(policies, payments)
    policies = finalize_status(policies, claims)
    telematics = build_telematics(policies, cfg["telematics_budget"])

    if args.scale == "seed":
        write_csv(customers, f"{SEED_DIR}/customers.csv")
        write_csv(policies.drop(columns=["driver_aggressiveness", "finance_stress"]),
                  f"{SEED_DIR}/policies.csv")
        write_csv(payments, f"{SEED_DIR}/payments.csv")
        if not claims.empty:
            write_csv(claims.drop(columns=["fraud_probability", "severity_pct"]),
                      f"{SEED_DIR}/claims.csv")
            write_csv(alerts, f"{SEED_DIR}/fraud_alerts.csv")
        if not telematics.empty:
            write_csv(telematics, f"{SEED_DIR}/telematics.csv")
        log.info("Seed CSVs → %s", SEED_DIR)

    counts = _emit_landing(policies, customers, claims, alerts, payments, telematics)
    manifest = {
        "scale": args.scale,
        "data_start": str(DATA_START), "data_end": str(DATA_END),
        "rows": {**{c: int(len(d)) for c, d in
                    [("customers", customers), ("policies", policies), ("payments", payments),
                     ("claims", claims), ("fraud_alerts", alerts), ("telematics", telematics)]},
                 **{f"landing_{k}": v for k, v in counts.items()}},
        "fraud_rate": round(float(claims.fraud_flag.mean()), 4) if not claims.empty else None,
        "churn_rate": round(float(policies.churned.mean()), 4),
        "total_premium": round(float(policies.annual_premium.sum()), 2),
        "total_incurred": round(float(claims.claim_amount.sum()), 2) if not claims.empty else 0.0,
    }
    write_json(manifest, "data/manifest.json")
    log.info("Manifest: %s", json.dumps(manifest["rows"], indent=0))
    log.info("Fraud rate %.2f%% | churn %.2f%% | portfolio LR ≈ %.1f%%",
             100 * (manifest["fraud_rate"] or 0), 100 * manifest["churn_rate"],
             100 * manifest["total_incurred"] / max(manifest["total_premium"], 1))


if __name__ == "__main__":
    main()
