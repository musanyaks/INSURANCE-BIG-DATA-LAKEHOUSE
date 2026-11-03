"""Premium & payout payments stream.

    python -m streaming.payments_stream --mode produce --rate 60
    python -m streaming.payments_stream --mode consume

Schema (payments-events):
    payment_id · policy_id · due_date · amount · status · method
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

log = get_logger("streaming.payments")
TOPIC = TOPICS["payments"]
DATE_FIELD = "due_date"
KEY_FIELD = "payment_id"
SEED_CSV = "payments"


def produce(args) -> None:
    rows = require_landing_or_seed(SEED_CSV, DATE_FIELD, args.from_landing)
    producer = get_producer()
    send_records(producer, TOPIC, rows, KEY_FIELD, args.rate, args.limit, args.duration)
    producer.close()


def consume(args) -> None:
    consume_to_landing(TOPIC, "payments-ingest", "stream", "payments",
                       DATE_FIELD, args.max_records)


def main() -> None:
    args = stream_argparser("Premium/payments stream (Kafka)").parse_args()
    produce(args) if args.mode == "produce" else consume(args)


if __name__ == "__main__":
    main()
