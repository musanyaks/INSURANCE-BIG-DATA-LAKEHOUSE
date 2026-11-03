# Data Quality Report

_Generated 2026-11-02 14:03 UTC_

**18 passed · 0 failed · 0 skipped**

| Dataset | Check | Status | Detail |
|---|---|---|---|
| silver.policies | `not_null` | PASS | {'policy_id': 0, 'customer_id': 0, 'product': 0, 'annual_premium': 0} |
| silver.policies | `unique` | PASS | 0 duplicates |
| silver.policies | `allowed_values` | PASS | 0 rows outside ['Active', 'Renewed', 'Lapsed', 'Cancelled'] |
| silver.policies | `range` | PASS | 0 rows outside [50, 100000] |
| silver.customers | `unique` | PASS | 0 duplicates |
| silver.customers | `range` | PASS | 0 rows outside [18, 100] |
| silver.claims | `not_null` | PASS | {'claim_id': 0, 'policy_id': 0, 'claim_amount': 0} |
| silver.claims | `unique` | PASS | 0 duplicates |
| silver.claims | `range` | PASS | 0 rows outside [1, 500000] |
| silver.claims | `referential` | PASS | 0 orphaned rows |
| silver.payments | `unique` | PASS | 0 duplicates |
| silver.payments | `allowed_values` | PASS | 0 rows outside ['Paid', 'Failed', 'Returned'] |
| silver.telematics | `range` | PASS | 0 rows outside [0, 200] |
| gold.policy_performance | `unique` | PASS | 0 duplicates |
| gold.policy_performance | `range` | PASS | 0 rows outside [0, 5] |
| gold.policy_performance | `not_null` | PASS | {'policy_id': 0, 'product': 0, 'earned_premium': 0} |
| gold.portfolio_kpis | `range` | PASS | 0 rows outside [0, 6] (cells ≥100 in-force) |
| gold.fraud_scores | `range` | PASS | 0 rows outside [0, 1] |
