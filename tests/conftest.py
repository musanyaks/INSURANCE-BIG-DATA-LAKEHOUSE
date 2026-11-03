"""Shared fixtures: deterministic seed data + a one-shot medallion run."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))


@pytest.fixture(scope="session")
def seed_data() -> Path:
    """Generate the tiny deterministic seed dataset (idempotent)."""
    seed_csv = REPO / "data" / "seed" / "policies.csv"
    if not seed_csv.exists():
        from ingestion.synthetic.generator import main as generate

        old_argv = sys.argv
        sys.argv = ["generator", "--scale", "seed"]
        try:
            generate()
        finally:
            sys.argv = old_argv
    return REPO / "data" / "seed"


@pytest.fixture(scope="session")
def medallion(seed_data):
    """Run the pandas reference medallion (bronze→silver→gold) once."""
    from spark.pandas_reference import run_all

    return run_all()
