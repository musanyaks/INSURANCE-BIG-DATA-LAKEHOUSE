"""Telematics ping stream — the high-volume feed (~85% of total event count).

    python -m streaming.telematics_stream --mode produce --rate 500 --duration 30
    python -m streaming.telematics_stream --mode consume

Schema (telematics-pings):
    ping_id · policy_id · ping_ts · speed_kph · harsh_braking · harsh_accel
    night_trip · odometer_km

Because pings are tiny and numerous they are keyed by policy_id so that all
events of one vehicle land on the same partition (ordering per vehicle).
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

log = get_logger("streaming.telematics")
TOPIC = TOPICS["telematics"]
DATE_FIELD = "ping_ts"
KEY_FIELD = "policy_id"   # partition by vehicle, not by ping
SEED_CSV = "telematics"


def produce(args) -> None:
    rows = require_landing_or_seed(SEED_CSV, DATE_FIELD, args.from_landing)
    producer = get_producer()
    send_records(producer, TOPIC, rows, KEY_FIELD, args.rate, args.limit, args.duration)
    producer.close()


def consume(args) -> None:
    consume_to_landing(TOPIC, "telematics-ingest", "stream", "telematics",
                       DATE_FIELD, args.max_records)


def main() -> None:
    args = stream_argparser("Telematics ping stream (Kafka)").parse_args()
    produce(args) if args.mode == "produce" else consume(args)


if __name__ == "__main__":
    main()
