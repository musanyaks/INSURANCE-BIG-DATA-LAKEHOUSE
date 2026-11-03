"""Claims FNOL stream — first notification of loss events.

    # terminal 1 (broker)          docker compose up -d kafka && make topics
    # terminal 2 (produce)         python -m streaming.claims_stream --mode produce --rate 25
    # terminal 3 (consume)         python -m streaming.claims_stream --mode consume

Schema (claims-events):
    claim_id · policy_id · loss_date · report_date · reported_lag_days · peril
    claim_amount · paid_amount · reserve_amount · status · closed_date
    night_indicator · prior_claims · fraud_flag
"""
from __future__ import annotations

from common.config import TOPICS, get_logger
from streaming.common import (
    consume_to_landing,
    get_producer,
    require_landing_or_seed,
    send_records,
    stream_argparser,
)

log = get_logger("streaming.claims")
TOPIC = TOPICS["claims"]
DATE_FIELD = "report_date"
KEY_FIELD = "claim_id"
SEED_CSV = "claims"


def produce(args) -> None:
    rows = require_landing_or_seed(SEED_CSV, DATE_FIELD, args.from_landing)
    producer = get_producer()
    send_records(producer, TOPIC, rows, KEY_FIELD, args.rate, args.limit, args.duration)
    producer.close()


def consume(args) -> None:
    consume_to_landing(TOPIC, "claims-ingest", "stream", "claims",
                       DATE_FIELD, args.max_records)


def main() -> None:
    args = stream_argparser("Claims FNOL stream (Kafka)").parse_args()
    produce(args) if args.mode == "produce" else consume(args)


if __name__ == "__main__":
    main()
