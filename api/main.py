"""Meridian Mutual lakehouse serving API.

Reads the gold marts directly (local parquet or s3a://MinIO depending on
LAKEHOUSE_ROOT) and exposes portfolio KPIs, policy 360 views, claim details,
fraud alerts and the reserving output.

    uvicorn api.main:app --reload          # http://localhost:8000/docs
"""
from __future__ import annotations

from functools import lru_cache

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from common.config import REPO_ROOT, fraud_threshold, get_logger, layer_path
from common.io import read_json, read_table

log = get_logger("api")
app = FastAPI(
    title="Meridian Mutual Lakehouse API",
    version="1.0.0",
    description="Serving layer over the gold marts of the insurance data lakehouse.",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])


# ── data access (cached) ─────────────────────────────────────────────────────
@lru_cache(maxsize=8)
def _gold(dataset: str) -> pd.DataFrame:
    try:
        return read_table(layer_path("gold", dataset))
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"gold/{dataset} not available — run `make demo` first ({exc})") from exc


def _records(df: pd.DataFrame, limit: int | None = None) -> list[dict]:
    out = df.copy()
    for c in out.columns:
        if str(out[c].dtype).startswith("datetime"):
            out[c] = out[c].dt.strftime("%Y-%m-%d")
        elif str(out[c].dtype) == "category":
            out[c] = out[c].astype(str)
    out = out.replace({pd.NA: None, float("nan"): None})
    return out.head(limit).to_dict("records") if limit else out.to_dict("records")


# ── routes ───────────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health() -> dict:
    try:
        n = len(_gold("policy_performance"))
        return {"status": "ok", "gold_ready": True, "policies": n}
    except HTTPException:
        return {"status": "degraded", "gold_ready": False}


@app.get("/kpis/summary", tags=["portfolio"])
def kpi_summary() -> dict:
    k = _gold("portfolio_kpis")
    latest_month = k.month.max()
    latest = k[k.month == latest_month]
    ytd = k[k.month == latest_month]
    def _sum(d, c): return round(float(d[c].sum()), 2)
    return {
        "month": latest_month,
        "products": _records(latest[["month", "product", "policies_inforce", "gwp",
                                     "earned_premium", "incurred", "loss_ratio",
                                     "combined_ratio", "claim_frequency",
                                     "avg_severity", "fraud_rate"]]),
        "portfolio": {
            "gwp": _sum(ytd, "gwp"),
            "earned_premium": _sum(ytd, "earned_premium"),
            "incurred": _sum(ytd, "incurred"),
            "loss_ratio": round(_sum(ytd, "incurred") / max(_sum(ytd, "earned_premium"), 1), 4),
            "claims": int(ytd.n_claims.sum()),
        },
    }


@app.get("/kpis/monthly", tags=["portfolio"])
def kpi_monthly(product: str | None = None, limit: int = 200) -> list[dict]:
    k = _gold("portfolio_kpis")
    if product:
        k = k[k["product"] == product]
    return _records(k.sort_values(["month", "product"]), limit)


@app.get("/policies/{policy_id}", tags=["policies"])
def policy_detail(policy_id: str) -> dict:
    p = _gold("policy_performance")
    row = p[p.policy_id == policy_id]
    if row.empty:
        raise HTTPException(404, f"policy {policy_id} not found")
    return _records(row)[0]


@app.get("/claims/{claim_id}", tags=["claims"])
def claim_detail(claim_id: str) -> dict:
    f = _gold("fraud_scores")
    row = f[f.claim_id == claim_id]
    if row.empty:
        raise HTTPException(404, f"claim {claim_id} not found in fraud mart")
    return _records(row)[0]


@app.get("/customers/{customer_id}/profile", tags=["customers"])
def customer_profile(customer_id: str) -> dict:
    c = _gold("customer_360")
    row = c[c.customer_id == customer_id]
    if row.empty:
        raise HTTPException(404, f"customer {customer_id} not found")
    return _records(row)[0]


@app.get("/fraud/alerts", tags=["fraud"])
def fraud_alerts(threshold: float = Query(default=None, ge=0, le=1),
                 priority: str | None = None, limit: int = 100) -> dict:
    f = _gold("fraud_scores")
    # default: top-10% review queue unless an absolute cutoff is configured
    thr = threshold if threshold is not None else fraud_threshold(f.fraud_probability)
    alerts = f[f.fraud_probability >= thr]
    if priority:
        alerts = alerts[alerts.alert_priority == priority]
    return {"threshold": thr, "count": int(len(alerts)),
            "alerts": _records(alerts.sort_values("fraud_probability", ascending=False), limit)}


@app.get("/reserving/summary", tags=["actuarial"])
def reserving_summary() -> dict:
    path = REPO_ROOT / "actuarial" / "reserving" / "output" / "reserve_summary.json"
    if not path.exists():
        raise HTTPException(404, "reserve summary not generated — run `make actuarial`")
    return read_json(path)


@app.get("/pricing/adequacy", tags=["actuarial"])
def pricing_adequacy() -> list[dict]:
    path = REPO_ROOT / "actuarial" / "pricing" / "output" / "adequacy_by_segment.csv"
    if not path.exists():
        raise HTTPException(404, "adequacy output not generated — run `make actuarial`")
    return pd.read_csv(path).to_dict("records")
