"""Legacy flat-file ingestion: adjuster notes export → landing zone (JSONL).

    python -m ingestion.files.file_ingestor                 # ingest
    python -m ingestion.files.file_ingestor --validate-only # schema check only
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from common.config import get_logger, landing_path
from common.io import write_jsonl

log = get_logger("ingest.files")

SAMPLE = Path(__file__).parent / "sample_adjuster_notes.csv"

REQUIRED_SCHEMA = {
    "note_id": "string",
    "claim_id": "string",
    "adjuster": "string",
    "note": "string",
    "scraped_date": "datetime64[ns]",
}


def validate(df: pd.DataFrame) -> list[str]:
    """Return a list of schema/quality problems (empty list = valid)."""
    problems = []
    for col, expected in REQUIRED_SCHEMA.items():
        if col not in df.columns:
            problems.append(f"missing column: {col}")
            continue
        if expected == "string" and df[col].isna().any():
            problems.append(f"nulls in required column: {col}")
        if expected == "datetime64[ns]":
            try:
                pd.to_datetime(df[col])
            except Exception:
                problems.append(f"unparseable dates in column: {col}")
    dupes = df[df.columns[0]].duplicated().sum()
    if dupes:
        problems.append(f"{dupes} duplicate note_ids")
    return problems


def ingest(path: Path = SAMPLE) -> int:
    df = pd.read_csv(path)
    problems = validate(df)
    if problems:
        log.error("Schema validation failed: %s", "; ".join(problems))
        raise SystemExit(2)
    df["scraped_date"] = pd.to_datetime(df["scraped_date"])
    df["ingested_at"] = datetime.now(timezone.utc).isoformat()
    n = 0
    for dt, chunk in df.groupby(df.scraped_date.dt.strftime("%Y-%m-%d")):
        out = f"{landing_path('files', 'adjuster_notes')}/dt={dt}/part-0000.jsonl"
        write_jsonl(chunk.to_dict("records"), out)
        n += len(chunk)
        log.info("wrote %3d notes → %s", len(chunk), out)
    log.info("File ingestion complete (%d notes).", n)
    return n


def main() -> None:
    ap = argparse.ArgumentParser(description="Legacy CSV → landing zone")
    ap.add_argument("--file", default=str(SAMPLE))
    ap.add_argument("--validate-only", action="store_true")
    args = ap.parse_args()
    df = pd.read_csv(args.file)
    problems = validate(df)
    if problems:
        log.error("Schema validation failed: %s", "; ".join(problems))
        raise SystemExit(2)
    log.info("Schema OK (%d rows).", len(df))
    if not args.validate_only:
        ingest(Path(args.file))


if __name__ == "__main__":
    main()
