# Pipeline Lineage

```mermaid
flowchart LR
  subgraph Sources
    S1["Kafka topics"]
    S2["PostgreSQL"]
    S3["Legacy files"]
  end
  subgraph Landing
    L[landing zone JSONL]
  end
  subgraph Medallion
    B[bronze] --> V[silver] --> G[gold]
  end
  subgraph Serving
    P[gold marts] --> A[FastAPI]
    P --> D[Streamlit]
    P --> BI[Power BI / Trino]
  end
    bronze.claims -->|claims| silver.claims
    bronze.customers -->|customers_db| silver.customers
    bronze.fraud -->|fraud| gold.fraud_scores
    bronze.fraud -->|fraud| silver.fraud_alerts
    bronze.payments -->|payments| silver.payments
    bronze.policies -->|policies_db| silver.policies
    bronze.telematics -->|telematics| silver.telematics
    kafka:claims-events -->|claims| landing/stream/claims
    kafka:fraud-alerts -->|fraud| landing/stream/fraud
    kafka:payments-events -->|payments| landing/stream/payments
    kafka:telematics-pings -->|telematics| landing/stream/telematics
    landing/database/customers -->|customers_db| bronze.customers
    landing/database/policies -->|policies_db| bronze.policies
    landing/files/adjuster_notes -->|adjuster_notes| (bronze.files)
    landing/stream/claims -->|claims| bronze.claims
    landing/stream/fraud -->|fraud| bronze.fraud
    landing/stream/payments -->|payments| bronze.payments
    landing/stream/telematics -->|telematics| bronze.telematics
    legacy_csv -->|adjuster_notes| landing/files/adjuster_notes
    postgres:customers -->|customers_db| landing/database/customers
    postgres:policies -->|policies_db| landing/database/policies
    silver.claims -->|claims| gold.claims_daily
    silver.claims -->|claims| gold.fraud_scores
    silver.claims -->|claims| gold.policy_performance
    silver.customers -->|customers_db| gold.customer_360
    silver.payments -->|payments| gold.customer_360
    silver.payments -->|payments| gold.portfolio_kpis
    silver.policies -->|policies_db| gold.customer_360
    silver.policies -->|policies_db| gold.policy_performance
    silver.policies -->|policies_db| gold.portfolio_kpis
    silver.telematics -->|telematics| gold.policy_performance
    silver.telematics -->|telematics| gold.telematics_behavior
```

## Column-level lineage (key metrics)

- **`gold.policy_performance.loss_ratio`** ← `silver.claims.claim_amount` ← `silver.policies.annual_premium` ← `silver.policies.effective_date` ← `silver.policies.expiry_date`
- **`gold.policy_performance.driving_score`** ← `silver.telematics.harsh_braking` ← `silver.telematics.harsh_accel` ← `silver.telematics.night_trip`
- **`gold.portfolio_kpis.loss_ratio`** ← `silver.claims.claim_amount` ← `silver.policies.annual_premium`
- **`gold.portfolio_kpis.claim_frequency`** ← `silver.claims.claim_id` ← `silver.policies.policy_id`
- **`gold.fraud_scores.fraud_probability`** ← `silver.claims.fraud_flag` ← `ml.fraud.train_fraud_model`
