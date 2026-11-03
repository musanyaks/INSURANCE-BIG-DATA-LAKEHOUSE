# Meridian Mutual — Data Catalog

_Generated 2026-11-02 14:03 UTC · 18 datasets_

## `bronze.claims` — 718 rows

| Column | Type | Description |
|---|---|---|
| `claim_id` | object | Unique claim identifier (CL000001…) |
| `policy_id` | object | Unique policy identifier (P000001…) |
| `loss_date` | object | Date the loss occurred |
| `peril` | object | Cause of loss (Collision, Storm, Surgery, …) |
| `claim_amount` | float64 | Total estimated claim cost (USD) — ultimate basis |
| `night_indicator` | bool | 1 if loss/observation occurred at night |
| `prior_claims` | int64 | Number of earlier claims on the same policy |
| `reported_lag_days` | int64 | Days between loss and reporting (fraud signal) |
| `report_date` | object | Date the FNOL was reported |
| `severity_pct` | float64 | Claim size percentile within its peril |
| `status` | object | Policy status: Active | Renewed | Lapsed | Cancelled |
| `paid_amount` | float64 | Amount paid to date (USD) |
| `reserve_amount` | float64 | Outstanding case reserve (USD) |
| `closed_date` | object | `object` column |
| `fraud_flag` | bool | Ground-truth / confirmed fraud indicator |
| `fraud_probability` | float64 | Model-estimated fraud probability [0,1] |
| `_loaded_at` | datetime64[us, UTC] | `datetime64[us, UTC]` column |
| `_source` | object | `object` column |

## `bronze.customers` — 6,000 rows

| Column | Type | Description |
|---|---|---|
| `customer_id` | object | Unique customer identifier (C000001…) |
| `name` | object | `object` column |
| `age` | int64 | `int64` column |
| `region` | object | Sales territory: North | South | East | West | Central |
| `customer_since` | object | `object` column |
| `credit_band` | object | `object` column |
| `_loaded_at` | datetime64[us, UTC] | `datetime64[us, UTC]` column |
| `_source` | object | `object` column |

## `bronze.fraud` — 58 rows

| Column | Type | Description |
|---|---|---|
| `alert_id` | object | `object` column |
| `claim_id` | object | Unique claim identifier (CL000001…) |
| `alert_date` | object | `object` column |
| `alert_score` | float64 | `float64` column |
| `siu_outcome` | object | SIU investigation outcome |
| `_loaded_at` | datetime64[us, UTC] | `datetime64[us, UTC]` column |
| `_source` | object | `object` column |

## `bronze.payments` — 75,151 rows

| Column | Type | Description |
|---|---|---|
| `payment_id` | object | Unique premium payment identifier |
| `policy_id` | object | Unique policy identifier (P000001…) |
| `due_date` | object | `object` column |
| `amount` | float64 | `float64` column |
| `status` | object | Policy status: Active | Renewed | Lapsed | Cancelled |
| `method` | object | `object` column |
| `_loaded_at` | datetime64[us, UTC] | `datetime64[us, UTC]` column |
| `_source` | object | `object` column |

## `bronze.policies` — 8,000 rows

| Column | Type | Description |
|---|---|---|
| `policy_id` | object | Unique policy identifier (P000001…) |
| `customer_id` | object | Unique customer identifier (C000001…) |
| `product` | object | Line of business: Motor | Home | Health |
| `sub_product` | object | Line of business: Motor | Home | Health |
| `region` | object | Sales territory: North | South | East | West | Central |
| `distribution_channel` | object | Distribution channel: Direct | Agent | Broker | Online |
| `effective_date` | object | Policy inception date |
| `expiry_date` | object | Policy expiry date |
| `annual_premium` | float64 | Annual written premium (USD) |
| `sum_insured` | float64 | Coverage limit (USD) |
| `driver_aggressiveness` | float64 | `float64` column |
| `finance_stress` | float64 | `float64` column |
| `status` | object | Policy status: Active | Renewed | Lapsed | Cancelled |
| `churned` | int64 | 1 if the policy lapsed or was cancelled at renewal |
| `_loaded_at` | datetime64[us, UTC] | `datetime64[us, UTC]` column |
| `_source` | object | `object` column |

## `bronze.telematics` — 118,366 rows

| Column | Type | Description |
|---|---|---|
| `ping_id` | object | `object` column |
| `policy_id` | object | Unique policy identifier (P000001…) |
| `ping_ts` | object | `object` column |
| `speed_kph` | float64 | Observed speed (km/h) |
| `harsh_braking` | bool | Ping flagged for harsh braking |
| `harsh_accel` | bool | Ping flagged for harsh acceleration |
| `night_trip` | bool | Ping recorded between 22:00 and 06:00 |
| `odometer_km` | float64 | Cumulative odometer reading (km) |
| `_loaded_at` | datetime64[us, UTC] | `datetime64[us, UTC]` column |
| `_source` | object | `object` column |

## `silver.claims` — 718 rows

| Column | Type | Description |
|---|---|---|
| `claim_id` | object | Unique claim identifier (CL000001…) |
| `policy_id` | object | Unique policy identifier (P000001…) |
| `loss_date` | datetime64[ns] | Date the loss occurred |
| `peril` | object | Cause of loss (Collision, Storm, Surgery, …) |
| `claim_amount` | float64 | Total estimated claim cost (USD) — ultimate basis |
| `night_indicator` | bool | 1 if loss/observation occurred at night |
| `prior_claims` | int64 | Number of earlier claims on the same policy |
| `reported_lag_days` | int64 | Days between loss and reporting (fraud signal) |
| `report_date` | datetime64[ns] | Date the FNOL was reported |
| `severity_pct` | float64 | Claim size percentile within its peril |
| `status` | object | Policy status: Active | Renewed | Lapsed | Cancelled |
| `paid_amount` | float64 | Amount paid to date (USD) |
| `reserve_amount` | float64 | Outstanding case reserve (USD) |
| `closed_date` | datetime64[ns] | `datetime64[ns]` column |
| `fraud_flag` | bool | Ground-truth / confirmed fraud indicator |
| `fraud_probability` | float64 | Model-estimated fraud probability [0,1] |
| `product` | object | Line of business: Motor | Home | Health |
| `region` | object | Sales territory: North | South | East | West | Central |

## `silver.customers` — 6,000 rows

| Column | Type | Description |
|---|---|---|
| `customer_id` | object | Unique customer identifier (C000001…) |
| `name` | object | `object` column |
| `age` | int64 | `int64` column |
| `region` | object | Sales territory: North | South | East | West | Central |
| `customer_since` | datetime64[ns] | `datetime64[ns]` column |
| `credit_band` | object | `object` column |
| `age_band` | category | `category` column |

## `silver.fraud_alerts` — 58 rows

| Column | Type | Description |
|---|---|---|
| `alert_id` | object | `object` column |
| `claim_id` | object | Unique claim identifier (CL000001…) |
| `alert_date` | object | `object` column |
| `alert_score` | float64 | `float64` column |
| `siu_outcome` | object | SIU investigation outcome |

## `silver.payments` — 75,151 rows

| Column | Type | Description |
|---|---|---|
| `payment_id` | object | Unique premium payment identifier |
| `policy_id` | object | Unique policy identifier (P000001…) |
| `due_date` | datetime64[ns] | `datetime64[ns]` column |
| `amount` | float64 | `float64` column |
| `status` | object | Policy status: Active | Renewed | Lapsed | Cancelled |
| `method` | object | `object` column |

## `silver.policies` — 8,000 rows

| Column | Type | Description |
|---|---|---|
| `policy_id` | object | Unique policy identifier (P000001…) |
| `customer_id` | object | Unique customer identifier (C000001…) |
| `product` | object | Line of business: Motor | Home | Health |
| `sub_product` | object | Line of business: Motor | Home | Health |
| `region` | object | Sales territory: North | South | East | West | Central |
| `distribution_channel` | object | Distribution channel: Direct | Agent | Broker | Online |
| `effective_date` | datetime64[ns] | Policy inception date |
| `expiry_date` | datetime64[ns] | Policy expiry date |
| `annual_premium` | float64 | Annual written premium (USD) |
| `sum_insured` | float64 | Coverage limit (USD) |
| `driver_aggressiveness` | float64 | `float64` column |
| `finance_stress` | float64 | `float64` column |
| `status` | object | Policy status: Active | Renewed | Lapsed | Cancelled |
| `churned` | int64 | 1 if the policy lapsed or was cancelled at renewal |

## `silver.telematics` — 118,366 rows

| Column | Type | Description |
|---|---|---|
| `ping_id` | object | `object` column |
| `policy_id` | object | Unique policy identifier (P000001…) |
| `ping_ts` | datetime64[ns] | `datetime64[ns]` column |
| `speed_kph` | float64 | Observed speed (km/h) |
| `harsh_braking` | bool | Ping flagged for harsh braking |
| `harsh_accel` | bool | Ping flagged for harsh acceleration |
| `night_trip` | bool | Ping recorded between 22:00 and 06:00 |
| `odometer_km` | float64 | Cumulative odometer reading (km) |

## `gold.claims_daily` — 695 rows

| Column | Type | Description |
|---|---|---|
| `loss_date` | object | Date the loss occurred |
| `product` | object | Line of business: Motor | Home | Health |
| `region` | object | Sales territory: North | South | East | West | Central |
| `n_claims` | int64 | `int64` column |
| `incurred` | float64 | Total incurred claim cost (USD) |
| `paid` | float64 | `float64` column |

## `gold.customer_360` — 6,000 rows

| Column | Type | Description |
|---|---|---|
| `customer_id` | object | Unique customer identifier (C000001…) |
| `name` | object | `object` column |
| `age_band` | category | `category` column |
| `region` | object | Sales territory: North | South | East | West | Central |
| `tenure_months` | float64 | `float64` column |
| `n_policies` | float64 | `float64` column |
| `total_premium` | float64 | `float64` column |
| `n_claims` | float64 | `float64` column |
| `open_claims` | float64 | `float64` column |
| `payment_failures` | float64 | `float64` column |
| `churned` | float64 | 1 if the policy lapsed or was cancelled at renewal |
| `clv_estimate` | float64 | `float64` column |

## `gold.fraud_scores` — 718 rows

| Column | Type | Description |
|---|---|---|
| `claim_id` | object | Unique claim identifier (CL000001…) |
| `fraud_probability` | float64 | Model-estimated fraud probability [0,1] |
| `fraud_flag` | bool | Ground-truth / confirmed fraud indicator |
| `report_date` | datetime64[ns] | Date the FNOL was reported |
| `siu_outcome` | object | SIU investigation outcome |
| `alert_priority` | object | Triage priority: High | Medium | Low |

## `gold.policy_performance` — 8,000 rows

| Column | Type | Description |
|---|---|---|
| `policy_id` | object | Unique policy identifier (P000001…) |
| `customer_id` | object | Unique customer identifier (C000001…) |
| `product` | object | Line of business: Motor | Home | Health |
| `sub_product` | object | Line of business: Motor | Home | Health |
| `region` | object | Sales territory: North | South | East | West | Central |
| `distribution_channel` | object | Distribution channel: Direct | Agent | Broker | Online |
| `effective_date` | datetime64[ns] | Policy inception date |
| `expiry_date` | datetime64[ns] | Policy expiry date |
| `status` | object | Policy status: Active | Renewed | Lapsed | Cancelled |
| `annual_premium` | float64 | Annual written premium (USD) |
| `sum_insured` | float64 | Coverage limit (USD) |
| `months_exposure` | float64 | Policy exposure in months |
| `earned_premium` | float64 | Pro-rata earned premium for the exposure (USD) |
| `n_claims` | float64 | `float64` column |
| `open_claims` | float64 | `float64` column |
| `fraud_claims` | float64 | `float64` column |
| `incurred` | float64 | Total incurred claim cost (USD) |
| `paid` | float64 | `float64` column |
| `loss_ratio` | float64 | incurred ÷ earned premium |
| `driving_score` | float64 | Telematics driving score 5-100 (higher = safer) |
| `risk_tier` | int64 | Composite risk tier 1 (lowest) … 5 (highest) |
| `churned` | int64 | 1 if the policy lapsed or was cancelled at renewal |

## `gold.portfolio_kpis` — 102 rows

| Column | Type | Description |
|---|---|---|
| `month` | object | `object` column |
| `product` | object | Line of business: Motor | Home | Health |
| `policies_inforce` | int64 | `int64` column |
| `gwp` | float64 | Gross written premium in the month (USD) |
| `earned_premium` | float64 | Pro-rata earned premium for the exposure (USD) |
| `n_claims` | float64 | `float64` column |
| `claim_frequency` | float64 | Claims per policy in force in the month |
| `avg_severity` | float64 | Average incurred cost per claim (USD) |
| `incurred` | float64 | Total incurred claim cost (USD) |
| `paid` | float64 | `float64` column |
| `loss_ratio` | float64 | incurred ÷ earned premium |
| `expense_ratio` | float64 | `float64` column |
| `combined_ratio` | float64 | Loss ratio + expense ratio |
| `fraud_rate` | float64 | `float64` column |

## `gold.telematics_behavior` — 4,387 rows

| Column | Type | Description |
|---|---|---|
| `policy_id` | object | Unique policy identifier (P000001…) |
| `pings` | int64 | `int64` column |
| `mileage_km` | float64 | `float64` column |
| `harsh_braking_rate` | float64 | `float64` column |
| `harsh_accel_rate` | float64 | `float64` column |
| `night_rate` | float64 | `float64` column |
| `avg_speed_kph` | float64 | Observed speed (km/h) |
| `driving_score` | float64 | Telematics driving score 5-100 (higher = safer) |
