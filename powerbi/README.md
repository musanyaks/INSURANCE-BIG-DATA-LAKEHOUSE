# Power BI — Gold Layer Model

## Connecting

| Option | How | Best for |
|---|---|---|
| **Trino (recommended)** | Start `docker compose --profile query up -d`, install the Trino ODBC driver, connect to `localhost:8080`, catalog `lakehouse`, schema `gold`. Import `policy_performance`, `portfolio_kpis`, `claims_daily`, `fraud_scores`, `customer_360`, `telematics_behavior`. | Full model with DirectQuery option |
| **Parquet import** | Copy `lakehouse/gold/*` parquet files and use the *Parquet connector* / a dataflow gateway. | Quick one-off reports |
| **Reserving outputs** | Import `actuarial/reserving/output/*.csv` as flat tables. | Actuarial visuals |

## Star schema

```
        dim_product            dim_region            dim_date
             \                     |                     /
              ┌────────────────────┴────────────────────┐
              │        fct_portfolio_kpis (monthly)     │
              │  fct_policy_performance (policy grain)  │
              │  fct_claims_daily      (day grain)      │
              │  fct_fraud_scores      (claim grain)    │
              └────────────────────┬────────────────────┘
                                   |
                        fct_reserves (accident quarter)
```

Keys: `product`, `region`, `month` (YYYY-MM), `policy_id`, `claim_id`,
`accident_quarter`. Create a `dim_date` from `month` with CALENDAR().

## Measures

`measures.dax` contains ready-made measures: Loss Ratio, Combined Ratio,
Claim Frequency, Average Severity, Fraud Rate, Reserve Adequacy. Paste them
into the model's measure table.

## Refresh & governance

- Schedule refresh after each gold run (Makefile `spark-gold` / `medallion-local`).
- Row-level security suggestion: filter `policy_performance[region]` by the
  report viewer's territory from `USERPRINCIPALNAME()` mapping table.
- Column descriptions live in `governance/catalog/output/DATA_CATALOG.md` —
  copy them into the model's field descriptions for everyone's benefit.
