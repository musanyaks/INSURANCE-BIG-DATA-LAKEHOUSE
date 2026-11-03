"""FastAPI serving layer tests against the medallion gold output."""
from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import app
from common.io import read_table

client = TestClient(app)


def test_health(medallion):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["gold_ready"] is True
    assert body["policies"] > 0


def test_kpi_summary(medallion):
    r = client.get("/kpis/summary")
    assert r.status_code == 200
    body = r.json()
    assert {"month", "products", "portfolio"} <= set(body)
    assert body["portfolio"]["earned_premium"] > 0


def test_kpi_monthly_series(medallion):
    r = client.get("/kpis/monthly", params={"limit": 50})
    assert r.status_code == 200
    assert isinstance(r.json(), list) and len(r.json()) > 0


def test_policy_lookup_roundtrip(medallion):
    perf = read_table("lakehouse/gold/policy_performance")
    pid = perf.policy_id.iloc[0]
    r = client.get(f"/policies/{pid}")
    assert r.status_code == 200
    assert r.json()["policy_id"] == pid

    r404 = client.get("/policies/DOES-NOT-EXIST")
    assert r404.status_code == 404


def test_fraud_alerts_shape(medallion):
    r = client.get("/fraud/alerts", params={"threshold": 0.0, "limit": 10})
    assert r.status_code == 200
    body = r.json()
    assert {"threshold", "count", "alerts"} <= set(body)
    assert body["count"] >= 0
