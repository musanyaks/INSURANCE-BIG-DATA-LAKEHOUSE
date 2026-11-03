"""Declarative data-quality suite for the silver and gold layers.

    python -m governance.quality.quality_checks      (or `make quality`)

Checks: not_null · unique · allowed_values · range · referential-integrity.
Results: governance/quality/output/dq_report.{json,md}; exit 1 on failure.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from common import datasets
from common.config import get_logger

log = get_logger("governance.quality")
OUT = Path(__file__).resolve().parent / "output"

CHECKS = [
    # ── silver ────────────────────────────────────────────────────────────────
    {"dataset": "policies", "layer": "silver", "check": "not_null",
     "columns": ["policy_id", "customer_id", "product", "annual_premium"]},
    {"dataset": "policies", "layer": "silver", "check": "unique", "column": "policy_id"},
    {"dataset": "policies", "layer": "silver", "check": "allowed_values", "column": "status",
     "values": ["Active", "Renewed", "Lapsed", "Cancelled"]},
    {"dataset": "policies", "layer": "silver", "check": "range", "column": "annual_premium",
     "min": 50, "max": 100_000},
    {"dataset": "customers", "layer": "silver", "check": "unique", "column": "customer_id"},
    {"dataset": "customers", "layer": "silver", "check": "range", "column": "age",
     "min": 18, "max": 100},
    {"dataset": "claims", "layer": "silver", "check": "not_null",
     "columns": ["claim_id", "policy_id", "claim_amount"]},
    {"dataset": "claims", "layer": "silver", "check": "unique", "column": "claim_id"},
    {"dataset": "claims", "layer": "silver", "check": "range", "column": "claim_amount",
     "min": 1, "max": 500_000},
    {"dataset": "claims", "layer": "silver", "check": "referential", "column": "policy_id",
     "ref_dataset": "policies", "ref_column": "policy_id"},
    {"dataset": "payments", "layer": "silver", "check": "unique", "column": "payment_id"},
    {"dataset": "payments", "layer": "silver", "check": "allowed_values", "column": "status",
     "values": ["Paid", "Failed", "Returned"]},
    {"dataset": "telematics", "layer": "silver", "check": "range", "column": "speed_kph",
     "min": 0, "max": 200},
    # ── gold ──────────────────────────────────────────────────────────────────
    {"dataset": "policy_performance", "layer": "gold", "check": "unique", "column": "policy_id"},
    {"dataset": "policy_performance", "layer": "gold", "check": "range", "column": "loss_ratio",
     "min": 0, "max": 5},
    {"dataset": "policy_performance", "layer": "gold", "check": "not_null",
     "columns": ["policy_id", "product", "earned_premium"]},
    {"dataset": "portfolio_kpis", "layer": "gold", "check": "range", "column": "loss_ratio",
     "min": 0, "max": 6, "min_inforce": 100},  # cat-peril months spike; suppress tiny cells
    {"dataset": "fraud_scores", "layer": "gold", "check": "range", "column": "fraud_probability",
     "min": 0, "max": 1},
]

LOADERS = {
    ("silver", "policies"): datasets.load_policies,
    ("silver", "customers"): datasets.load_customers,
    ("silver", "claims"): datasets.load_claims,
    ("silver", "payments"): datasets.load_payments,
    ("silver", "telematics"): datasets.load_telematics,
}


def _frame(layer: str, dataset: str) -> pd.DataFrame | None:
    if (layer, dataset) in LOADERS:
        return LOADERS[(layer, dataset)]()
    return datasets.load_gold(dataset)


def run_checks() -> list[dict]:
    results = []
    cache: dict[str, pd.DataFrame | None] = {}
    for spec in CHECKS:
        ds, layer = spec["dataset"], spec["layer"]
        if ds not in cache:
            cache[ds] = _frame(layer, ds)
        df = cache[ds]
        base = {"dataset": f"{layer}.{ds}", "check": spec["check"]}
        if df is None or df.empty:
            results.append({**base, "status": "SKIPPED", "detail": "dataset unavailable"})
            continue

        if spec["check"] == "not_null":
            bad = {c: int(df[c].isna().sum()) for c in spec["columns"] if c in df}
            failed = sum(bad.values()) > 0
            results.append({**base, "status": "FAIL" if failed else "PASS", "detail": bad})
        elif spec["check"] == "unique":
            n = int(df[spec["column"]].duplicated().sum())
            results.append({**base, "status": "FAIL" if n else "PASS", "detail": f"{n} duplicates"})
        elif spec["check"] == "allowed_values":
            bad_mask = ~df[spec["column"]].isin(spec["values"])
            n = int(bad_mask.sum())
            results.append({**base, "status": "FAIL" if n else "PASS",
                            "detail": f"{n} rows outside {spec['values']}"})
        elif spec["check"] == "range":
            col, mn, mx = spec["column"], spec.get("min"), spec.get("max")
            d = df
            if "min_inforce" in spec and "policies_inforce" in d:
                d = d[d.policies_inforce >= spec["min_inforce"]]  # small-cell suppression
            series = pd.to_numeric(d[col], errors="coerce")
            n = int(((series < mn) | (series > mx)).sum())
            results.append({**base, "status": "FAIL" if n else "PASS",
                            "detail": f"{n} rows outside [{mn}, {mx}]"
                                      + (f" (cells ≥{spec['min_inforce']} in-force)"
                                         if "min_inforce" in spec else "")})
        elif spec["check"] == "referential":
            parent = cache.get(spec["ref_dataset"])
            if parent is None:
                parent = _frame("silver", spec["ref_dataset"])
                cache[spec["ref_dataset"]] = parent
            if parent is None:
                results.append({**base, "status": "SKIPPED", "detail": "parent missing"})
                continue
            n = int((~df[spec["column"]].isin(parent[spec["ref_column"]])).sum())
            results.append({**base, "status": "FAIL" if n else "PASS",
                            "detail": f"{n} orphaned rows"})
    return results


def main() -> int:
    results = run_checks()
    OUT.mkdir(exist_ok=True)
    failed = [r for r in results if r["status"] == "FAIL"]
    passed = sum(r["status"] == "PASS" for r in results)

    (OUT / "dq_report.json").write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {"total": len(results), "passed": passed, "failed": len(failed),
                    "skipped": sum(r["status"] == "SKIPPED" for r in results)},
        "results": results}, indent=2))

    lines = ["# Data Quality Report", "",
             f"_Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC}_", "",
             f"**{passed} passed · {len(failed)} failed · "
             f"{sum(r['status'] == 'SKIPPED' for r in results)} skipped**", "",
             "| Dataset | Check | Status | Detail |", "|---|---|---|---|"]
    for r in results:
        lines.append(f"| {r['dataset']} | `{r['check']}` | {r['status']} | {r['detail']} |")
    (OUT / "dq_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    log.info("DQ suite: %d/%d passed, %d failed → %s", passed, len(results), len(failed),
             OUT / "dq_report.md")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
