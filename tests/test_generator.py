"""Generator contract tests: schema, ranges and injected signals."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def test_seed_csvs_exist_with_expected_schema(seed_data: Path):
    policies = pd.read_csv(seed_data / "policies.csv")
    for col in ["policy_id", "customer_id", "product", "region", "effective_date",
                "expiry_date", "annual_premium", "status", "churned"]:
        assert col in policies.columns, f"missing column {col}"
    assert len(policies) == 240
    assert (policies.annual_premium > 0).all()
    assert set(policies["product"].unique()) <= {"Motor", "Home", "Health"}
    claims = pd.read_csv(seed_data / "claims.csv")
    for col in ["claim_id", "policy_id", "loss_date", "peril", "claim_amount",
                "paid_amount", "fraud_flag"]:
        assert col in claims.columns
    assert (claims.claim_amount > 0).all()


def test_injected_signals_are_present(seed_data: Path):
    claims = pd.read_csv(seed_data / "claims.csv")
    policies = pd.read_csv(seed_data / "policies.csv")
    fraud_rate = claims.fraud_flag.mean()
    assert 0.005 <= fraud_rate <= 0.20, f"fraud rate out of band: {fraud_rate}"
    churn_rate = policies.churned.mean()
    assert 0.01 <= churn_rate <= 0.45
    # seasonality: motor losses should skew to winter months
    motor = claims[claims.peril.isin(["Collision", "Theft", "Third-Party Injury"])]
    if len(motor) > 20:
        winter = motor[pd.to_datetime(motor.loss_date).dt.month.isin([12, 1, 2])]
        summer = motor[pd.to_datetime(motor.loss_date).dt.month.isin([6, 7, 8])]
        assert len(winter) >= len(summer)


def test_manifest_records_counts(seed_data: Path):
    from ingestion.synthetic.generator import SCALES

    manifest = json.loads((seed_data.parent / "manifest.json").read_text())
    assert manifest["scale"] in SCALES
    rows = manifest["rows"]
    assert rows["policies"] == SCALES[manifest["scale"]]["policies"]
    assert "fraud_rate" in manifest


def test_landing_zone_written(seed_data: Path):
    landing = Path(__file__).resolve().parents[1] / "lakehouse" / "landing"
    assert (landing / "stream" / "claims").exists()
    assert (landing / "database" / "policies").exists()
    jsonl_files = list((landing / "stream" / "claims").rglob("*.jsonl"))
    assert jsonl_files
    first_line = jsonl_files[0].read_text().splitlines()[0]
    assert "claim_id" in json.loads(first_line)
