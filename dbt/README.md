# dbt — SQL marts over the lakehouse

`dbt/` owns the SQL transformation layer on top of the medallion output.
Models are ANSI SQL; they run against **Trino** (docker profile `query`)
reading the lakehouse bucket, or any Spark Thrift endpoint.

## Layout

```
dbt/
├── dbt_project.yml            # staging = views, marts = tables, vars
├── profiles.yml.example       # trino target (copy to profiles.yml)
├── models/
│   ├── schema.yml             # sources + column tests
│   ├── staging/               # stg_policies · stg_claims · stg_payments
│   └── marts/                 # fct_claims · mart_loss_ratio_by_region
│                              # mart_pricing_adequacy
├── snapshots/scd_customers.sql  # SCD2 on credit_band / region / age
└── tests/custom/assert_loss_ratio_range.sql
```

## Run

```bash
cd dbt
cp profiles.yml.example profiles.yml        # adjust host/port if needed
dbt deps && dbt run && dbt test
dbt snapshot                                # build scd_customers
```

Docker route:

```bash
docker compose --profile query up -d trino
docker run --network insurance-lakehouse_default -v $PWD:/work ghcr.io/dbt-labs/dbt-trino:latest \
    run --profiles-dir /work
```

## Tests included

* `unique` / `not_null` on every staging key
* `accepted_values` on policy status, product, payment status
* `relationships` — every claim's `policy_id` exists in `stg_policies`
* custom singular test: mart loss ratios within `[0, 3]`

## Variables

| Var | Default | Used by |
|---|---|---|
| `target_loss_ratio` | `0.68` | `mart_pricing_adequacy` rate actions |
| `expense_ratio` | `0.15` | combined-ratio maths |

Override with `dbt run --vars '{"target_loss_ratio": 0.72}'`.
