"""Mock partner quote API — simulates an external aggregator that pushes
quote requests into Meridian's pipeline (used to demo ingestion/api).

    uvicorn ingestion.api.mock_partner_api:app --port 8001
"""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
from fastapi import FastAPI

app = FastAPI(title="Mock Partner Quote API", version="1.0.0",
              description="Synthetic third-party quote feed for the lakehouse demo.")

RNG = np.random.default_rng(7)
PRODUCTS = ["Motor", "Home", "Health"]
REGIONS = ["North", "South", "East", "West", "Central"]
CHANNELS = ["Direct", "Agent", "Broker", "Online"]
PARTNERS = ["aggregator-a", "aggregator-b", "compare-market"]


def _quote(i: int) -> dict:
    return {
        "quote_id": f"Q{i:07d}",
        "partner": str(RNG.choice(PARTNERS)),
        "requested_product": str(RNG.choice(PRODUCTS, p=[0.55, 0.30, 0.15])),
        "applicant_age": int(np.clip(RNG.normal(41, 14), 18, 80)),
        "region": str(RNG.choice(REGIONS)),
        "channel": str(RNG.choice(CHANNELS)),
        "sum_insured": float(np.round(RNG.lognormal(10.5, 0.9), 2)),
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/quotes/random")
def random_quote() -> dict:
    return _quote(int(RNG.integers(1, 10_000_000)))


@app.get("/quotes/batch")
def batch(n: int = 50) -> list[dict]:
    base = int(RNG.integers(1, 9_000_000))
    return [_quote(base + i) for i in range(max(1, min(n, 500)))]
