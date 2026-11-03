"""Fraud alert stream — SIU referrals with real-time enrichment.

    python -m streaming.fraud_stream --mode produce --rate 5
    python -m streaming.fraud_stream --mode consume

The consumer demonstrates a *streaming enrichment* step: every alert is tagged
with a triage priority and a processing timestamp before it is written to the
landing zone. In production this is where you would call the fraud model
endpoint for an on-arrival score.

Schema (fraud-alerts):
    alert_id · claim_id · alert_date · alert_score · siu_outcome
    → enriched: alert_priority · processed_at
"""
from __future__ import annotations

from datetime import datetime, timezone

from common.config import TOPICS, get_logger
from streaming.common import (
    consume_to_landing,
    get_producer,
    require_landing_or_seed,
    send_records,
    stream_argparser,
)

log = get_logger("streaming.fraud")
TOPIC = TOPICS["fraud"]
DATE_FIELD = "alert_date"
KEY_FIELD = "alert_id"
SEED_CSV = "fraud_alerts"


def enrich_alert(rec: dict) -> dict:
    """Stream-processing hook: triage priority derived from the alert score."""
    score = float(rec.get("alert_score") or 0.0)
    rec["alert_priority"] = "High" if score >= 0.75 else ("Medium" if score >= 0.60 else "Low")
    rec["processed_at"] = datetime.now(timezone.utc).isoformat()
    return rec


def produce(args) -> None:
    rows = require_landing_or_seed(SEED_CSV, DATE_FIELD, args.from_landing)
    producer = get_producer()
    send_records(producer, TOPIC, rows, KEY_FIELD, args.rate, args.limit, args.duration)
    producer.close()


def consume(args) -> None:
    consume_to_landing(TOPIC, "fraud-ingest", "stream", "fraud",
                       DATE_FIELD, args.max_records, enrich=enrich_alert)


def main() -> None:
    args = stream_argparser("Fraud alert stream (Kafka)").parse_args()
    produce(args) if args.mode == "produce" else consume(args)


if __name__ == "__main__":
    main()
