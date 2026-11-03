"""Incremental extraction from the PostgreSQL system of record → landing zone.

    python -m ingestion.database.db_extractor                # needs Postgres up
    python -m ingestion.database.db_extractor --fallback-seed # offline dev mode

The extractor pulls every table where updated_at is newer than the watermark
stored in lakehouse/.watermarks.json and writes one JSONL file per table per
run — the pattern a Debezium/CDC pipeline would produce.
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone

from common.config import REPO_ROOT, SEED_DIR, get_logger, landing_path
from common.io import read_csv, read_json, write_json, write_jsonl

log = get_logger("ingest.db")
WATERMARKS = REPO_ROOT / "lakehouse" / ".watermarks.json"

TABLES = {
    "customers": "SELECT * FROM customers WHERE updated_at > :since",
    "policies": "SELECT * FROM policies WHERE updated_at > :since",
    "premium_payments": "SELECT * FROM premium_payments WHERE updated_at > :since",
    "claims": "SELECT * FROM claims WHERE updated_at > :since",
}

EPOCH = "1970-01-01T00:00:00+00:00"


def _engine():
    from sqlalchemy import create_engine
    url = (f"postgresql+psycopg2://{os.getenv('POSTGRES_USER', 'meridian')}:"
           f"{os.getenv('POSTGRES_PASSWORD', 'meridian_dev')}@"
           f"{os.getenv('POSTGRES_HOST', 'localhost')}:{os.getenv('POSTGRES_PORT', '5432')}/"
           f"{os.getenv('POSTGRES_DB', 'meridian_policy')}")
    return create_engine(url, pool_pre_ping=True)


def extract_from_postgres() -> int:
    from sqlalchemy import text
    marks = read_json(WATERMARKS) if (REPO_ROOT / "lakehouse" / ".watermarks.json").exists() else {}
    engine = _engine()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total = 0
    with engine.connect() as conn:
        for table, sql in TABLES.items():
            since = marks.get(table, EPOCH)
            rows = [dict(r._mapping) for r in conn.execute(text(sql), {"since": since})]
            if not rows:
                log.info("%-16s no new rows since %s", table, since)
                continue
            out = f"{landing_path('database', table)}/dt={today}/part-extract.jsonl"
            write_jsonl(rows, out)
            total += len(rows)
            log.info("%-16s +%d rows → %s", table, len(rows), out)
    return total


def extract_fallback_from_seed() -> int:
    """Offline demo: replay data/seed CSVs through the same landing contract."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mapping = {"customers": "customers.csv", "policies": "policies.csv",
               "premium_payments": "payments.csv", "claims": "claims.csv"}
    total = 0
    for table, fname in mapping.items():
        try:
            df = read_csv(SEED_DIR / fname)
        except Exception:
            log.warning("seed file missing for %s — run `make seed-data` first", table)
            continue
        df["updated_at"] = datetime.now(timezone.utc).isoformat()
        out = f"{landing_path('database', table)}/dt={today}/part-extract.jsonl"
        write_jsonl(df.to_dict("records"), out)
        total += len(df)
        log.info("%-16s +%d rows (seed fallback) → %s", table, len(df), out)
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description="Postgres → landing zone extractor")
    ap.add_argument("--fallback-seed", action="store_true",
                    help="extract from data/seed CSVs instead of a live database")
    args = ap.parse_args()
    if args.fallback_seed:
        n = extract_fallback_from_seed()
    else:
        n = extract_from_postgres()
        if n == 0:
            log.info("Nothing new extracted.")
    now = datetime.now(timezone.utc).isoformat()
    write_json({"last_extract": now}, WATERMARKS)
    log.info("Extraction finished (%d rows). Watermark updated.", n)


if __name__ == "__main__":
    main()
