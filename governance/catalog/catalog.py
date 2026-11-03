"""Data catalog / data dictionary generator.

Scans every dataset in the lakehouse (bronze/silver/gold), extracts the schema
from the Parquet files and enriches it with curated business descriptions.

    python -m governance.catalog.catalog      (or `make catalog`)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa

from common.config import LAKEHOUSE_ROOT, get_logger, layer_path
from common.io import get_fs, read_table

log = get_logger("governance.catalog")
OUT = Path(__file__).resolve().parent / "output"

DESCRIPTIONS = {
    "policy_id": "Unique policy identifier (P000001…)",
    "customer_id": "Unique customer identifier (C000001…)",
    "claim_id": "Unique claim identifier (CL000001…)",
    "payment_id": "Unique premium payment identifier",
    "product": "Line of business: Motor | Home | Health",
    "sub_product": "Product variant within the line of business",
    "region": "Sales territory: North | South | East | West | Central",
    "channel": "Distribution channel: Direct | Agent | Broker | Online",
    "annual_premium": "Annual written premium (USD)",
    "sum_insured": "Coverage limit (USD)",
    "effective_date": "Policy inception date",
    "expiry_date": "Policy expiry date",
    "status": "Policy status: Active | Renewed | Lapsed | Cancelled",
    "churned": "1 if the policy lapsed or was cancelled at renewal",
    "loss_date": "Date the loss occurred",
    "report_date": "Date the FNOL was reported",
    "reported_lag_days": "Days between loss and reporting (fraud signal)",
    "peril": "Cause of loss (Collision, Storm, Surgery, …)",
    "claim_amount": "Total estimated claim cost (USD) — ultimate basis",
    "paid_amount": "Amount paid to date (USD)",
    "reserve_amount": "Outstanding case reserve (USD)",
    "fraud_flag": "Ground-truth / confirmed fraud indicator",
    "fraud_probability": "Model-estimated fraud probability [0,1]",
    "severity_pct": "Claim size percentile within its peril",
    "prior_claims": "Number of earlier claims on the same policy",
    "night_indicator": "1 if loss/observation occurred at night",
    "driving_score": "Telematics driving score 5-100 (higher = safer)",
    "months_exposure": "Policy exposure in months",
    "earned_premium": "Pro-rata earned premium for the exposure (USD)",
    "incurred": "Total incurred claim cost (USD)",
    "loss_ratio": "incurred ÷ earned premium",
    "risk_tier": "Composite risk tier 1 (lowest) … 5 (highest)",
    "gwp": "Gross written premium in the month (USD)",
    "claim_frequency": "Claims per policy in force in the month",
    "avg_severity": "Average incurred cost per claim (USD)",
    "combined_ratio": "Loss ratio + expense ratio",
    "harsh_braking": "Ping flagged for harsh braking",
    "harsh_accel": "Ping flagged for harsh acceleration",
    "night_trip": "Ping recorded between 22:00 and 06:00",
    "odometer_km": "Cumulative odometer reading (km)",
    "speed_kph": "Observed speed (km/h)",
    "siu_outcome": "SIU investigation outcome",
    "alert_priority": "Triage priority: High | Medium | Low",
}


def _describe_column(name: str, dtype: str) -> str:
    for key, desc in DESCRIPTIONS.items():
        if name == key or name.endswith(key):
            return desc
    return f"`{dtype}` column"


def scan_dataset(layer: str, dataset: str) -> dict | None:
    path = layer_path(layer, dataset)
    try:
        df = read_table(path)
    except Exception:
        return None
    schema = {c: str(t) for c, t in df.dtypes.items()}
    return {
        "dataset": f"{layer}.{dataset}",
        "layer": layer,
        "rows": int(len(df)),
        "columns": [{"name": c, "type": t, "description": _describe_column(c, t)}
                    for c, t in schema.items()],
    }


def main() -> int:
    fs = get_fs()
    root = LAKEHOUSE_ROOT.replace("s3a://", "").replace("s3://", "") if "s3" in LAKEHOUSE_ROOT \
        else str(Path(LAKEHOUSE_ROOT))
    entries = []
    for layer in ("bronze", "silver", "gold"):
        base = f"{root}/{layer}" if "s3" in LAKEHOUSE_ROOT else Path(root) / layer
        if "s3" in LAKEHOUSE_ROOT:
            try:
                infos = fs.get_file_info(pa.fs.FileSelector(str(base), recursive=False))
                datasets = [i.name.rsplit("/", 1)[-1] for i in infos if i.is_directory()]
            except Exception:
                datasets = []
        else:
            datasets = [d.name for d in base.iterdir() if d.is_dir()] if base.exists() else []
        for ds in sorted(datasets):
            entry = scan_dataset(layer, ds)
            if entry:
                entries.append(entry)

    OUT.mkdir(exist_ok=True)
    (OUT / "catalog.json").write_text(json.dumps(
        {"generated_at": datetime.now(timezone.utc).isoformat(),
         "datasets": entries}, indent=2))

    md = ["# Meridian Mutual — Data Catalog", "",
          f"_Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC} · "
          f"{len(entries)} datasets_", ""]
    for e in entries:
        md += [f"## `{e['dataset']}` — {e['rows']:,} rows", "",
               "| Column | Type | Description |", "|---|---|---|"]
        md += [f"| `{c['name']}` | {c['type']} | {c['description']} |" for c in e["columns"]]
        md.append("")
    (OUT / "DATA_CATALOG.md").write_text("\n".join(md))
    log.info("Catalog: %d datasets → %s", len(entries), OUT / "DATA_CATALOG.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
