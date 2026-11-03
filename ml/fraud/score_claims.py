"""Score claims (silver layer or an arbitrary JSONL of new claims) with the
trained fraud model.

    python -m ml.fraud.score_claims                       # score silver claims
    python -m ml.fraud.score_claims --input claims.jsonl  # score a file
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import pandas as pd

from common.config import fraud_threshold, get_logger
from ml.fraud.build_features import build_fraud_features
from ml.fraud.train_fraud_model import _design

log = get_logger("ml.fraud.score")
MODELS = Path(__file__).resolve().parents[1] / "models"
OUT = Path(__file__).resolve().parent / "output"


def score_frame(df: pd.DataFrame, artifact: dict) -> pd.DataFrame:
    X = _design(df).reindex(columns=artifact["feature_columns"], fill_value=0.0)
    proba = artifact["model"].predict_proba(X)[:, 1]
    out = df[["claim_id", "policy_id"]].copy()
    out["fraud_score"] = proba.round(4)
    thr = fraud_threshold(out.fraud_score)
    out["alert"] = (proba >= thr).astype(int)
    out["priority"] = pd.cut(out.fraud_score, [-0.01, thr - 0.05 if thr > 0.05 else 0.01, thr, 1.01],
                             labels=["Low", "Medium", "High"]).astype(str)
    return out.sort_values("fraud_score", ascending=False)


def main() -> None:
    ap = argparse.ArgumentParser(description="Score claims with the fraud model")
    ap.add_argument("--input", help="optional JSONL of new claims")
    args = ap.parse_args()

    artifact_path = MODELS / "fraud_model.joblib"
    if not artifact_path.exists():
        raise SystemExit("No trained model — run `make ml-train` first.")
    artifact = joblib.load(artifact_path)

    if args.input:
        with open(args.input) as fh:
            df = pd.DataFrame([json.loads(line) for line in fh if line.strip()])
    else:
        built = build_fraud_features()
        if built is None:
            raise SystemExit("No claims available to score.")
        df, _ = built

    scored = score_frame(df, artifact)
    thr = fraud_threshold(scored.fraud_score)
    OUT.mkdir(exist_ok=True)
    scored.to_parquet(OUT / "scored_claims.parquet", index=False)
    scored.head(50).to_csv(OUT / "top_alerts.csv", index=False)
    log.info("Scored %d claims → %s (%d alerts at threshold %.3f)",
             len(scored), OUT / "scored_claims.parquet",
             int(scored.alert.sum()), thr)


if __name__ == "__main__":
    main()
