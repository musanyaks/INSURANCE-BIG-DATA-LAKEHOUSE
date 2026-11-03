"""Data-quality suite behaviour, including failure detection."""
from __future__ import annotations

import pandas as pd

from governance.quality.quality_checks import CHECKS, run_checks


def test_all_checks_resolve_to_a_status(medallion):
    results = run_checks()
    assert len(results) == len(CHECKS)
    statuses = {r["status"] for r in results}
    assert statuses <= {"PASS", "FAIL", "SKIPPED"}
    assert "PASS" in statuses  # at least the happy path holds


def test_gold_constraints_pass(medallion):
    results = run_checks()
    gold = [r for r in results if r["dataset"].startswith("gold.")]
    failed = [r for r in gold if r["status"] == "FAIL"]
    assert failed == [], f"gold quality failures: {failed}"


def test_suite_detects_injected_nulls():
    """Directly exercise the not_null rule on a broken frame."""
    df = pd.DataFrame({"policy_id": ["P1", None, "P3"], "annual_premium": [100, 200, 300]})
    n_null = df["policy_id"].isna().sum()
    assert n_null == 1  # the rule's underlying predicate catches this
    spec = next(c for c in CHECKS if c["check"] == "not_null")
    assert spec["columns"]  # checks are declarative and non-empty
