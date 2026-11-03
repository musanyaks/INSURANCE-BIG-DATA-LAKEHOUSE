"""Tiny model registry: every trainer records its artifact + metrics."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parent / "models"
REGISTRY = MODELS_DIR / "registry.json"


def register(name: str, artifact_path: str, metrics: dict, model_type: str,
             features: list[str] | None = None) -> None:
    MODELS_DIR.mkdir(exist_ok=True)
    registry = {}
    if REGISTRY.exists():
        registry = json.loads(REGISTRY.read_text())
    history = registry.get(name, {}).get("history", [])
    history.append({"retired_at": datetime.now(timezone.utc).isoformat(),
                    "metrics": registry.get(name, {}).get("metrics", {})})
    registry[name] = {
        "model_type": model_type,
        "artifact": artifact_path,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "features": features or [],
        "history": history[-5:],
    }
    REGISTRY.write_text(json.dumps(registry, indent=2, default=str))
