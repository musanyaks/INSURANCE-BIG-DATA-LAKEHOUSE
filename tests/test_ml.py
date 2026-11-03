"""ML trainers: smoke-test on the tiny seed book, quality gate when big."""
from __future__ import annotations

from ml.churn.train_churn_model import main as train_churn
from ml.fraud.build_features import build_fraud_features
from ml.fraud.train_fraud_model import main as train_fraud
from ml.risk.risk_scoring import main as risk_score


def test_fraud_features_buildable(medallion):
    built = build_fraud_features()
    assert built is not None
    X, y = built
    assert {"log_claim_amount", "reported_lag_days", "payment_failure_rate",
            "driving_score"} <= set(X.columns)
    assert set(y.unique()) <= {0, 1}
    assert len(X) == len(y)


def test_fraud_model_trains(medallion):
    metrics = train_fraud()
    assert "roc_auc" in metrics and "average_precision" in metrics
    if metrics["n_train"] >= 300:          # meaningful sample → quality gate
        assert metrics["roc_auc"] >= 0.58  # beats random with headroom
        assert metrics["precision_at_top_5pct"] >= metrics["fraud_rate"]


def test_churn_model_trains(medallion):
    metrics = train_churn()
    assert "roc_auc" in metrics
    if metrics["n"] >= 600:
        assert metrics["roc_auc"] >= 0.60


def test_risk_scoring_outputs_tiers(medallion):
    summary = risk_score()
    assert summary["policies"] > 0
    tiers = {int(t["risk_tier"]) for t in summary["tier_distribution"]}
    assert tiers <= {1, 2, 3, 4, 5}
