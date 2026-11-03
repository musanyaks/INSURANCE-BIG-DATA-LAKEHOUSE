"""Shared plumbing for the Meridian streaming layer.

Topology
--------
    synthetic replay ──▶ Kafka topic (3 partitions, keyed) ──▶ consumer group
                                                                    │
                                                                    ▼
                                              landing zone JSONL (dt=YYYY-MM-DD)
                                                                    │
                                                                    ▼
                                                     Spark bronze / Delta Lake

Every stream module supports two modes:

  produce  – replay rows from a source (seed CSV or generated landing files)
             into Kafka at a controlled rate
  consume  – drain a topic into the lakehouse landing zone, partitioned by
             business date, ready for the bronze Spark jobs
"""
from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from collections.abc import Callable, Iterator
from datetime import datetime, timezone
from pathlib import Path

from common.config import KAFKA_BOOTSTRAP, get_logger
from common.io import read_csv, write_jsonl

log = get_logger("streaming")


def _kafka():
    try:
        import kafka  # noqa: F401
    except ImportError as exc:
        raise SystemExit("kafka-python-ng missing — pip install -r requirements.txt") from exc
    return kafka


def get_producer():
    """Create a JSON KafkaProducer with idempotence + lz4 compression."""
    kafka = _kafka()
    return kafka.KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        key_serializer=lambda k: str(k).encode(),
        value_serializer=lambda v: json.dumps(v, default=str).encode(),
        acks="all",
        retries=5,
        compression_type="lz4",
        linger_ms=20,
        client_id="meridian-producer",
    )


def get_consumer(topic: str, group_id: str, auto_offset_reset: str = "earliest"):
    kafka = _kafka()
    return kafka.KafkaConsumer(
        topic,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=group_id,
        auto_offset_reset=auto_offset_reset,
        enable_auto_commit=False,
        value_deserializer=lambda v: json.loads(v.decode()),
        consumer_timeout_ms=1000,
        client_id="meridian-consumer",
    )


def send_records(producer, topic: str, rows: Iterator[dict], key_field: str,
                 rate: float, limit: int | None = None, duration: float | None = None) -> int:
    """Stream rows into a topic at `rate` records/sec. Returns count sent."""
    sent, start = 0, time.monotonic()
    for row in rows:
        if limit and sent >= limit:
            break
        if duration and time.monotonic() - start > duration:
            break
        key = row.get(key_field, sent)
        producer.send(topic, key=key, value=row)
        sent += 1
        if rate > 0:
            time.sleep(1.0 / rate)
        if sent % 500 == 0:
            producer.flush()
            log.info("[%s] sent %d records (%.0f rec/s elapsed avg)",
                     topic, sent, sent / max(time.monotonic() - start, 1e-6))
    producer.flush()
    log.info("[%s] finished: %d records sent in %.1fs", topic, sent, time.monotonic() - start)
    return sent


def rows_from_csv(path: Path, date_field: str) -> Iterator[dict]:
    """Yield CSV rows as dicts, oldest business date first (realistic replay)."""
    df = read_csv(path).sort_values(date_field)
    yield from df.to_dict("records")


def consume_to_landing(topic: str, group_id: str, source: str, dataset: str,
                       date_field: str, max_records: int | None = None,
                       enrich: Callable[[dict], dict] | None = None) -> int:
    """Drain a topic into landing JSONL partitioned by business date."""
    consumer = get_consumer(topic, group_id)
    by_date: dict[str, list[dict]] = defaultdict(list)
    n = 0
    log.info("Consuming %s (group=%s) → landing/%s/%s", topic, group_id, source, dataset)
    try:
        for msg in consumer:
            rec = dict(msg.value)
            if enrich:
                rec = enrich(rec)
            dt = str(rec.get(date_field, ""))[:10] or "unknown"
            by_date[dt].append(rec)
            n += 1
            if max_records and n >= max_records:
                break
            if n % 1000 == 0:
                _flush(by_date, source, dataset)
                consumer.commit()
    except KeyboardInterrupt:
        log.info("Interrupted — flushing and committing offsets…")
    finally:
        _flush(by_date, source, dataset)
        consumer.commit()
        consumer.close()
    log.info("Consumed %d records from %s", n, topic)
    return n


def _flush(by_date: dict[str, list[dict]], source: str, dataset: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%H%M%S")
    for dt, rows in by_date.items():
        if not rows:
            continue
        out = f"lakehouse/landing/{source}/{dataset}/dt={dt}/part-{stamp}.jsonl"
        write_jsonl(rows, out)
        rows.clear()


def stream_argparser(description: str) -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("--mode", choices=["produce", "consume"], required=True)
    ap.add_argument("--rate", type=float, default=25.0, help="records/sec when producing")
    ap.add_argument("--limit", type=int, help="max records to produce")
    ap.add_argument("--duration", type=float, help="stop producing after N seconds")
    ap.add_argument("--max-records", type=int, help="max records to consume")
    ap.add_argument("--from-landing", action="store_true",
                    help="replay from generated landing JSONL instead of the seed CSV")
    return ap


def require_landing_or_seed(name: str, date_field: str, from_landing: bool) -> Iterator[dict]:
    """Resolve the producer source: generated landing JSONL or seed CSV."""
    if from_landing:
        from common.io import iter_jsonl_dir

        yield from iter_jsonl_dir(f"lakehouse/landing/stream/{name}")
    else:
        yield from rows_from_csv(Path("data/seed") / f"{name}.csv", date_field)
