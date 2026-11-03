"""Churn model — logistic regression vs gradient boosting, best AUC wins.

    python -m ml.churn.train_churn_model
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from common.config import DATA_END, get_logger
from common.datasets import load_claims, load_driving_scores, load_payments, load_policies
from ml.registry import register

log = get_logger("ml.churn")
MODELS = Path(__file__).resolve().parents[1] / "models"
NUMERIC = ["tenure_months", "n_claims", "payment_failures", "log_premium",
           "log_sum_insured", "driving_score"]


def build_churn_features() -> tuple[pd.DataFrame, pd.Series] | None:
    policies = load_policies()
    if policies is None or "churned" not in policies or policies.churned.nunique() < 2:
        return None
    end = pd.Timestamp(DATA_END)
    df = policies.copy()
    df["tenure_months"] = ((end - df.effective_date).dt.days / 30.44).clip(1)
    claims = load_claims()
    df["n_claims"] = (df.policy_id.map(claims.groupby("policy_id").size())
                      if claims is not None else 0)
    df["n_claims"] = df.n_claims.fillna(0)
    payments = load_payments()
    if payments is not None:
        fails = payments[payments.status != "Paid"].groupby("policy_id").size()
        df["payment_failures"] = df.policy_id.map(fails).fillna(0)
    else:
        df["payment_failures"] = 0
    df["log_premium"] = np.log1p(df.annual_premium)
    df["log_sum_insured"] = np.log1p(df.sum_insured)
    scores = load_driving_scores()
    df["driving_score"] = (df.policy_id.map(scores).fillna(scores.median())
                           if scores is not None else 75.0)
    y = df.churned.astype(int)
    return df, y


def main() -> dict:
    built = build_churn_features()
    if built is None:
        log.error("No churn training data available.")
        return {}
    df, y = built
    X = pd.concat([
        df[NUMERIC],
        pd.get_dummies(df["product"], prefix="product", dtype=float),
        pd.get_dummies(df["region"], prefix="region", dtype=float),
    ], axis=1)

    candidates = {
        "logistic_regression": make_pipeline(StandardScaler(),
                                             LogisticRegression(max_iter=2000, C=0.5)),
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            max_iter=200, learning_rate=0.08, min_samples_leaf=15, random_state=42),
    }
    best_name, best_model, best_auc = None, None, -1.0

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    for name, mdl in candidates.items():
        try:
            proba = cross_val_predict(mdl, X, y, cv=cv, method="predict_proba")[:, 1]
            auc = float(roc_auc_score(y, proba))
            log.info("  %-24s CV ROC-AUC %.4f", name, auc)
            if auc > best_auc:
                best_name, best_model, best_auc = name, mdl, auc
        except Exception as exc:
            log.warning("  %-24s failed: %s", name, exc)
    best_model.fit(X, y)  # final fit for the artifact

    metrics = {"winner": best_name, "roc_auc": round(best_auc, 4),
               "churn_rate": round(float(y.mean()), 4), "n": int(len(X)),
               "cv": "5-fold stratified, out-of-fold predictions"}
    MODELS.mkdir(exist_ok=True)
    joblib.dump({"model": best_model, "feature_columns": list(X.columns),
                 "algorithm": best_name}, MODELS / "churn_model.joblib")
    (MODELS / "churn_metrics.json").write_text(json.dumps(metrics, indent=2))
    register("churn_classifier", str(MODELS / "churn_model.joblib"), metrics,
             best_name, features=list(X.columns))
    log.info("Churn model (%s): ROC-AUC %.3f → %s", best_name, best_auc,
             MODELS / "churn_model.joblib")
    return metrics


if __name__ == "__main__":
    main()
