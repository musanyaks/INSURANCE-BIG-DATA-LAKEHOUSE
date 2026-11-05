"""Fraud classifier — HistGradientBoosting on engineered claim features.

    python -m ml.fraud.train_fraud_model        (or `make ml-train`)

Artifacts: ml/models/fraud_model.joblib + fraud_metrics.json + registry entry.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from common.config import fraud_threshold, get_logger
from ml.fraud.build_features import build_fraud_features
from ml.registry import register

log = get_logger("ml.fraud")
OUT = Path(__file__).resolve().parent / "output"
MODELS = Path(__file__).resolve().parents[1] / "models"
NUMERIC = ["log_claim_amount", "reported_lag_days", "prior_claims", "night_indicator",
           "is_injury_peril", "payment_failure_rate", "log_premium", "driving_score"]


def _design(df: pd.DataFrame) -> pd.DataFrame:
    X = df[NUMERIC].copy()
    X = pd.concat([X, pd.get_dummies(df["product"], prefix="product", dtype=float)],
                  axis=1) if "product" in df else X
    return X


def main() -> dict:
    built = build_fraud_features()
    if built is None:
        log.error("No usable fraud training data — run `make demo-data && make medallion-local`.")
        return {}
    df, y = built
    X = _design(df)

    strat = y if y.value_counts().min() >= 2 and y.nunique() > 1 else None
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=42,
                                              stratify=strat)  # kept for permutation importance

    candidates = {
        "logistic_regression": make_pipeline(StandardScaler(),
                                             LogisticRegression(max_iter=2000, C=0.3)),
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            max_iter=120, learning_rate=0.05, max_leaf_nodes=8, min_samples_leaf=30,
            l2_regularization=5.0, random_state=42),
    }

    # 5-fold stratified CV → stable out-of-fold probabilities for all metrics
    from sklearn.model_selection import StratifiedKFold, cross_val_predict

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    best_name, model, proba = None, None, None
    for name, cand in candidates.items():
        try:
            p = cross_val_predict(cand, X, y, cv=cv, method="predict_proba")[:, 1]
            log.info("  %-24s CV ROC-AUC %.4f", name, roc_auc_score(y, p))
            if proba is None or roc_auc_score(y, p) > roc_auc_score(y, proba):
                best_name, model, proba = name, cand, p
        except Exception as exc:
            log.warning("  %-24s failed: %s", name, exc)
    if model is None:  # too little data for CV (tiny CI seed): in-sample fallback
        log.warning("CV unavailable on %d rows; falling back to in-sample fit", len(y))
        best_name, model = "logistic_regression", candidates["logistic_regression"]
        proba = model.fit(X, y).predict_proba(X)[:, 1]
    model.fit(X, y)  # final fit on all data for the artifact

    metrics = {
        "winner": best_name,
        "roc_auc": round(float(roc_auc_score(y, proba)), 4),
        "average_precision": round(float(average_precision_score(y, proba)), 4),
        "brier": round(float(brier_score_loss(y, proba)), 4),
        "n_train": int(len(X)), "n_test": int(len(X)),
        "fraud_rate": round(float(y.mean()), 4),
        "cv": "5-fold stratified, out-of-fold predictions",
    }
    k = max(1, int(0.05 * len(proba)))
    top_idx = np.argsort(-proba)[:k]
    metrics["precision_at_top_5pct"] = round(float(y.iloc[top_idx].mean()), 4)
    # quantile-based operating point (top-10% review queue) unless env overrides
    thr = fraud_threshold(proba)
    metrics["threshold"] = round(thr, 4)
    metrics["suggested_threshold"] = round(thr, 4)
    pred = (proba >= thr).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum())
    metrics["alerts_at_threshold"] = int(pred.sum())
    metrics["precision_at_threshold"] = round(tp / max(pred.sum(), 1), 4)
    metrics["recall_at_threshold"] = round(tp / max(int(y.sum()), 1), 4)

    MODELS.mkdir(exist_ok=True)
    OUT.mkdir(exist_ok=True)
    joblib.dump({"model": model, "feature_columns": list(X.columns)}, MODELS / "fraud_model.joblib")
    (MODELS / "fraud_metrics.json").write_text(json.dumps(metrics, indent=2))

    from sklearn.inspection import permutation_importance
    try:
        imp = permutation_importance(model, X_te, y_te, n_repeats=5, random_state=42,
                                     scoring="roc_auc")
        importance = sorted(zip(X.columns, imp.importances_mean),
                            key=lambda t: -abs(t[1]))[:10]
        (OUT / "feature_importance.json").write_text(json.dumps(
            [{"feature": f, "importance": round(float(v), 5)} for f, v in importance], indent=2))
    except Exception as exc:
        log.warning("Permutation importance skipped: %s", exc)

    register("fraud_classifier", str(MODELS / "fraud_model.joblib"), metrics,
             best_name or "unknown", features=list(X.columns))
    log.info("Fraud model: ROC-AUC %.3f | PR-AUC %.3f | precision@5%% %.2f → %s",
             metrics["roc_auc"], metrics["average_precision"],
             metrics["precision_at_top_5pct"], MODELS / "fraud_model.joblib")
    return metrics


if __name__ == "__main__":
    main()
