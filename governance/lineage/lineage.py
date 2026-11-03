"""Pipeline lineage manifest → mermaid diagram + JSON, with column lookup.

    python -m governance.lineage.lineage                     # render lineage.md
    python -m governance.lineage.lineage --table gold.policy_performance \
        --column loss_ratio                                  # trace a column
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "output"

# Table-level pipeline lineage (source → target)
PIPELINES = {
    "claims": ["kafka:claims-events", "landing/stream/claims", "bronze.claims",
               "silver.claims", ["gold.claims_daily", "gold.policy_performance",
                                 "gold.fraud_scores"]],
    "payments": ["kafka:payments-events", "landing/stream/payments", "bronze.payments",
                 "silver.payments", ["gold.customer_360", "gold.portfolio_kpis"]],
    "telematics": ["kafka:telematics-pings", "landing/stream/telematics",
                   "bronze.telematics", "silver.telematics",
                   ["gold.telematics_behavior", "gold.policy_performance"]],
    "fraud": ["kafka:fraud-alerts", "landing/stream/fraud", "bronze.fraud",
              ["silver.fraud_alerts", "gold.fraud_scores"]],
    "policies_db": ["postgres:policies", "landing/database/policies", "bronze.policies",
                    "silver.policies", ["gold.policy_performance", "gold.customer_360",
                                        "gold.portfolio_kpis"]],
    "customers_db": ["postgres:customers", "landing/database/customers",
                     "bronze.customers", "silver.customers", "gold.customer_360"],
    "adjuster_notes": ["legacy_csv", "landing/files/adjuster_notes", "(bronze.files)"],
}

# Column-level lineage for key gold metrics
COLUMN_LINEAGE = {
    ("gold.policy_performance", "loss_ratio"):
        ["silver.claims.claim_amount", "silver.policies.annual_premium",
         "silver.policies.effective_date", "silver.policies.expiry_date"],
    ("gold.policy_performance", "driving_score"):
        ["silver.telematics.harsh_braking", "silver.telematics.harsh_accel",
         "silver.telematics.night_trip"],
    ("gold.portfolio_kpis", "loss_ratio"):
        ["silver.claims.claim_amount", "silver.policies.annual_premium"],
    ("gold.portfolio_kpis", "claim_frequency"):
        ["silver.claims.claim_id", "silver.policies.policy_id"],
    ("gold.fraud_scores", "fraud_probability"):
        ["silver.claims.fraud_flag", "ml.fraud.train_fraud_model"],
}


def _edges() -> list[tuple[str, str, str]]:
    edges = []
    for name, chain in PIPELINES.items():
        for a, b in zip(chain, chain[1:]):
            for tgt in (b if isinstance(b, list) else [b]):
                edges.append((str(a), tgt, name))
    return edges


def to_mermaid() -> str:
    lines = ["```mermaid", "flowchart LR",
             "  subgraph Sources", '    S1["Kafka topics"]', '    S2["PostgreSQL"]',
             '    S3["Legacy files"]', "  end",
             "  subgraph Landing", "    L[landing zone JSONL]", "  end",
             "  subgraph Medallion", "    B[bronze] --> V[silver] --> G[gold]", "  end",
             "  subgraph Serving", "    P[gold marts] --> A[FastAPI]",
             "    P --> D[Streamlit]", "    P --> BI[Power BI / Trino]", "  end"]
    for src, dst, label in sorted(set(_edges())):
        lines.append(f"    {src} -->|{label}| {dst}")
    lines.append("```")
    return "\n".join(lines)


def render() -> None:
    OUT.mkdir(exist_ok=True)
    (OUT / "lineage.json").write_text(json.dumps(
        {"pipelines": {k: v for k, v in PIPELINES.items()},
         "edges": [{"from": a, "to": b, "pipeline": p} for a, b, p in _edges()]},
        indent=2, default=str))
    (OUT / "lineage.md").write_text(
        "# Pipeline Lineage\n\n" + to_mermaid()
        + "\n\n## Column-level lineage (key metrics)\n\n"
        + "\n".join(f"- **`{t}.{c}`** ← " + " ← ".join(f"`{u}`" for u in ups)
                     for (t, c), ups in COLUMN_LINEAGE.items())
        + "\n")


def trace(table: str, column: str) -> None:
    ups = COLUMN_LINEAGE.get((table, column))
    if not ups:
        print(f"No column-level lineage registered for {table}.{column}")
        print("Registered columns:")
        for (t, c) in COLUMN_LINEAGE:
            print(f"  - {t}.{c}")
        return
    print(f"{table}.{column}  ←  upstream:")
    for u in ups:
        print(f"   ← {u}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Lineage renderer / tracer")
    ap.add_argument("--table")
    ap.add_argument("--column")
    args = ap.parse_args()
    if args.table and args.column:
        trace(args.table, args.column)
    else:
        render()
        print(f"Lineage rendered → {OUT / 'lineage.md'}")


if __name__ == "__main__":
    main()
