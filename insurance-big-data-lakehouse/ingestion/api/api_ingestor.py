"""Pull quotes from a partner REST API into the lakehouse landing zone.

    # 1) start the mock partner API (or point --url at a real one)
    uvicorn ingestion.api.mock_partner_api:app --port 8001

    # 2) ingest
    python -m ingestion.api.api_ingestor --pages 5 --batch 100
"""
from __future__ import annotations

import argparse
import time
from datetime import datetime, timezone

import httpx

from common.config import get_logger, landing_path
from common.io import write_jsonl

log = get_logger("ingest.api")

DEFAULT_URL = "http://localhost:8001"


def fetch_batch(client: httpx.Client, url: str, batch: int, retries: int = 3) -> list[dict]:
    for attempt in range(1, retries + 1):
        try:
            r = client.get(f"{url.rstrip('/')}/quotes/batch", params={"n": batch}, timeout=10)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            log.warning("Fetch failed (attempt %d/%d): %s", attempt, retries, exc)
            time.sleep(1.5 * attempt)
    return []


def run(url: str, pages: int, batch: int) -> int:
    total, today = 0, datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with httpx.Client() as client:
        for page in range(1, pages + 1):
            rows = fetch_batch(client, url, batch)
            if not rows:
                log.error("Giving up after repeated failures (page %d).", page)
                break
            out = f"{landing_path('api', 'quotes')}/dt={today}/part-{page:04d}.jsonl"
            write_jsonl(rows, out)
            total += len(rows)
            log.info("Page %d: wrote %d quotes → %s", page, len(rows), out)
    log.info("Done. %d quotes ingested.", total)
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description="Partner API → landing zone")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--pages", type=int, default=3)
    ap.add_argument("--batch", type=int, default=100)
    args = ap.parse_args()
    run(args.url, args.pages, args.batch)


if __name__ == "__main__":
    main()
