"""Create the Kafka topics used by the streaming layer.

    python -m ingestion.kafka.topics
"""
from __future__ import annotations

import sys

from common.config import KAFKA_BOOTSTRAP, TOPICS, get_logger

log = get_logger("kafka.topics")


def main() -> int:
    try:
        from kafka.admin import KafkaAdminClient, NewTopic
    except ImportError:
        log.error("kafka-python-ng is not installed. Run: pip install -r requirements.txt")
        return 1

    try:
        admin = KafkaAdminClient(bootstrap_servers=KAFKA_BOOTSTRAP, client_id="lakehouse-setup")
    except Exception as exc:  # NoBrokersAvailable and friends
        log.error("Cannot reach Kafka at %s (%s).", KAFKA_BOOTSTRAP, exc)
        log.error("Start the broker first:  docker compose up -d kafka")
        return 1

    new_topics = [
        NewTopic(name=topic, num_partitions=3, replication_factor=1,
                 topic_configs={"retention.ms": str(7 * 24 * 3600 * 1000),
                                "compression.type": "lz4"})
        for topic in TOPICS.values()
    ]
    existing = set(admin.list_topics())
    to_create = [t for t in new_topics if t.name not in existing]
    if not to_create:
        log.info("All topics already exist: %s", sorted(existing))
        return 0
    admin.create_topics(to_create)
    log.info("Created topics: %s", [t.name for t in to_create])
    return 0


if __name__ == "__main__":
    sys.exit(main())
