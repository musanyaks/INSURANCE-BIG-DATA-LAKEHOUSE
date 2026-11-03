"""Central configuration for the Meridian Mutual lakehouse.

Every module reads paths, endpoints and feature flags from here so that the
same code runs on a laptop (local filesystem) and inside Docker (S3/MinIO).
"""
from __future__ import annotations

import logging
import os
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def _env(key: str, default: str) -> str:
    return os.getenv(key, default)


def _env_bool(key: str, default: bool = False) -> bool:
    return os.getenv(key, str(default)).strip().lower() in {"1", "true", "yes", "on"}


# ── Lakehouse layout ─────────────────────────────────────────────────────────
# LAKEHOUSE_ROOT is either a local directory (./lakehouse) or an S3 URI
# (s3a://lakehouse) when running inside Docker / against MinIO.
LAKEHOUSE_ROOT = _env("LAKEHOUSE_ROOT", str(REPO_ROOT / "lakehouse"))
IS_S3 = LAKEHOUSE_ROOT.startswith("s3a://") or LAKEHOUSE_ROOT.startswith("s3://")

DATA_DIR = REPO_ROOT / "data"
SEED_DIR = DATA_DIR / "seed"

DELTA_ENABLED = _env_bool("DELTA_ENABLED", True)

# ── Business calendar of the synthetic insurer ───────────────────────────────
DATA_START = date(2024, 1, 1)
DATA_END = date(2026, 10, 31)


def layer_path(layer: str, dataset: str) -> str:
    """Return the storage path of a dataset in a medallion layer.

    layer: bronze | silver | gold ; dataset: e.g. 'claims'
    """
    if IS_S3:
        return f"{LAKEHOUSE_ROOT.rstrip('/')}/{layer}/{dataset}"
    return str(Path(LAKEHOUSE_ROOT) / layer / dataset)


def landing_path(source: str, dataset: str) -> str:
    """Raw landing zone written by streaming/batch ingesters (JSONL)."""
    if IS_S3:
        return f"{LAKEHOUSE_ROOT.rstrip('/')}/landing/{source}/{dataset}"
    return str(Path(LAKEHOUSE_ROOT) / "landing" / source / dataset)


# ── Kafka ────────────────────────────────────────────────────────────────────
KAFKA_BOOTSTRAP = _env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPICS = {
    "claims": _env("CLAIMS_TOPIC", "claims-events"),
    "payments": _env("PAYMENTS_TOPIC", "payments-events"),
    "telematics": _env("TELEMATICS_TOPIC", "telematics-pings"),
    "fraud": _env("FRAUD_TOPIC", "fraud-alerts"),
}

# ── MinIO / S3 ───────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID = _env("AWS_ACCESS_KEY_ID", "minioadmin")
AWS_SECRET_ACCESS_KEY = _env("AWS_SECRET_ACCESS_KEY", "minioadmin")
S3_ENDPOINT = _env("S3_ENDPOINT", "http://minio:9000")

# ── Serving ──────────────────────────────────────────────────────────────────
# Fraud alerting is quantile-based by default (top-10% review queue) because
# calibrated scores on a ~6% base rate never reach arbitrary absolute cutoffs.
# Set FRAUD_ALERT_THRESHOLD=0.42 to force a fixed absolute cutoff instead.
_FRAUD_THRESHOLD_ENV = os.getenv("FRAUD_ALERT_THRESHOLD", "").strip()


def fraud_threshold(scores) -> float:
    """Resolve the fraud alert threshold: env override or top-10% quantile."""
    if _FRAUD_THRESHOLD_ENV:
        return float(_FRAUD_THRESHOLD_ENV)
    import pandas as pd

    s = pd.Series(scores).dropna()
    return float(s.quantile(0.90)) if len(s) else 0.60

# ── Logging ──────────────────────────────────────────────────────────────────
LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
    logger.setLevel(logging.INFO)
    return logger
