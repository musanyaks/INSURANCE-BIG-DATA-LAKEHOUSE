# Data Model

## Medallion contracts

### Bronze (raw, immutable)

Source-faithful records + lineage metadata:

| Column | Meaning |
|---|---|
| *(payload)* | exactly the fields the source emitted |
| `_source_file` | landing file the record came from |
| `_dt` | business-date partition of the landing file |
| `_loaded_at` | ingestion timestamp (dedup ordering) |

### Silver (one row per business key)

| Dataset | Key | Notable columns |
|---|---|---|
| `silver.policies` | `policy_id` | product, region, channel, annual_premium, status, churned, driver_aggressiveness, finance_stress |
| `silver.customers` | `customer_id` | name, age, age_band, region, credit_band |
| `silver.claims` | `claim_id` | loss/report dates, reported_lag_days, peril, claim/paid/reserve amounts, status, night_indicator, prior_claims, fraud_flag, fraud_probability, product, region |
| `silver.payments` | `payment_id` | due_date, amount, status (Paid/Failed/Returned), method |
| `silver.telematics` | `ping_id` | ping_ts, speed_kph (clipped 0-200), harsh_braking, harsh_accel, night_trip, odometer_km |
| `silver.fraud_alerts` | `alert_id` | alert_score, siu_outcome, alert_priority |

Transform rules: latest-record-wins dedup on `_loaded_at`, typed casts,
enum filtering, domain bounds (`claim_amount > 0`, `speed_kph ≤ 200`).

### Gold (dimensional marts)

| Mart | Grain | Built by |
|---|---|---|
| `policy_performance` | policy | exposure months, earned premium, claims, incurred/paid, **loss ratio**, driving score, **risk tier** |
| `portfolio_kpis` | month × product | GWP, earned premium, incurred, **loss/expense/combined ratio**, frequency, severity, fraud rate |
| `customer_360` | customer | n_policies, total premium, claims, open claims, payment failures, tenure, CLV estimate |
| `fraud_scores` | claim | model probability, threshold alert, SIU outcome, triage priority |
| `telematics_behavior` | policy | pings, mileage, harsh-event rates, **driving score 5-100** |
| `claims_daily` | day × product × region | counts, incurred, paid |

**Loss ratio** = incurred ÷ earned premium, where earned premium =
annual_premium × months_exposure ÷ 12 and exposure is clipped to the
valuation date (2026-10-31).

**Driving score** = `100 × (1 − 2.2·brake_rate − 1.4·accel_rate − 0.35·night_rate)`
clipped to [5, 100] — higher is safer.

**Risk tier** 1-5 blends claims frequency, severity, driving score and (for
motor) telematics: tier 5 = score < 45 or ≥ 3 claims; tier 4 = 2 claims or
score < 60; tier 3 = 1 claim; tier 2 = score < 75; tier 1 otherwise.

## dbt layer

`dbt/` owns SQL-side modelling over the same lakehouse (Trino or Spark
Thrift): `stg_*` conformed views → `fct_claims`,
`mart_loss_ratio_by_region`, `mart_pricing_adequacy` (+ source/model tests,
custom singular test, `scd_customers` snapshot). See `dbt/README.md`.

## Entity relationships

```
customers 1───N policies 1───N premium_payments
                    │
                    └──N claims 1───0..1 fraud_alerts
telematics pings N───1 policies (motor only)
```

The full, generated data dictionary (column types + business descriptions for
every bronze/silver/gold dataset) lives in
`governance/catalog/output/DATA_CATALOG.md`.
