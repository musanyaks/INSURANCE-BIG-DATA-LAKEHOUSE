# Governance

Three cooperating services live under `governance/`, all runnable as
Makefile targets and all reading the same lakehouse via `common.io`.

## 1. Data quality — `governance/quality/`

* **Declarative checks** in one place (`CHECKS` list): `not_null`,
  `unique`, `allowed_values`, `range`, `referential` across silver and gold.
* **Small-cell suppression**: range checks may declare `min_inforce` so
  monthly KPI cells with tiny exposure (a single $100k fire loss on 54
  policies) don't fire false alarms — the suppression is visible in the
  report detail.
* **Outputs**: `output/dq_report.json` (machine) + `dq_report.md` (human),
  exit code 1 on any failure → CI-ready.
* `make quality`

## 2. Lineage — `governance/lineage/`

* A **pipeline manifest** (source → topic → landing → bronze → silver → gold)
  rendered to a Mermaid diagram + `lineage.json`.
* **Column-level lineage** registered for the key metrics, e.g.:

  ```
  gold.policy_performance.loss_ratio
      ← silver.claims.claim_amount
      ← silver.policies.annual_premium
      ← silver.policies.effective_date / expiry_date
  ```

* Trace from the CLI: `python -m governance.lineage.lineage --table
  gold.policy_performance --column loss_ratio`
* `make lineage`

## 3. Catalog — `governance/catalog/`

* Scans every dataset directory in bronze/silver/gold, reads the Parquet
  schema, and enriches each column with curated business descriptions.
* Outputs `catalog.json` + a readable `DATA_CATALOG.md` (the data dictionary
  Power BI authors should copy into their model).
* `make catalog`

## Where governance plugs in

| Moment | Mechanism |
|---|---|
| After every gold run | `make quality` in CI or the nightly CronJob |
| Before releases | `pytest` includes quality + integrity tests |
| On schema change | re-run `make catalog`; review diff of `DATA_CATALOG.md` |
| On pipeline change | update the lineage manifest; regenerate `lineage.md` |
