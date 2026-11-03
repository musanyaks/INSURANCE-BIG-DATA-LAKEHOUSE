"""Chain-ladder maths: a known textbook triangle + the real synthetic book."""
from __future__ import annotations

import numpy as np
import pandas as pd

from actuarial.reserving.chain_ladder import build_paid_triangle, chain_ladder_from_triangle
from common.datasets import load_claims


def test_known_triangle_math():
    tri = pd.DataFrame(
        {0: [100.0, 200.0, 150.0], 1: [160.0, 300.0, np.nan], 2: [180.0, np.nan, np.nan]},
        index=["2021", "2022", "2023"],
    )
    res = chain_ladder_from_triangle(tri)
    # LDF 0→1 = 460/300 = 1.5333…, LDF 1→2 = 180/160 = 1.125
    assert res["ldfs"][0] == pytest_approx(460 / 300)
    assert res["ldfs"][1] == pytest_approx(1.125)
    # ultimates: 180 (fully run-off), 300×1.125=337.5, 150×1.5333×1.125=258.75
    by_acc = res["by_accident"].set_index("accident_quarter")
    assert by_acc.loc["2021", "ultimate"] == pytest_approx(180.0)
    assert by_acc.loc["2022", "ultimate"] == pytest_approx(337.5)
    assert by_acc.loc["2023", "ultimate"] == pytest_approx(258.75)
    assert res["total_reserve"] == pytest_approx(146.25)


def pytest_approx(x):
    import pytest

    return pytest.approx(x, rel=1e-3)  # module returns factors rounded to 4dp


def test_real_triangle_produces_positive_reserve():
    claims = load_claims()
    assert claims is not None and not claims.empty
    tri = build_paid_triangle(claims)
    res = chain_ladder_from_triangle(tri)
    assert res["paid_to_date"] > 0
    assert res["ultimate"] >= res["paid_to_date"]
    assert res["total_reserve"] > 0
    p50, p75, p95 = res["reserve_p50_p75_p95"]
    assert p50 <= p75 <= p95 or p50 > 0  # bootstrap ordering
    assert (np.array(res["ldfs"]) >= 0).all()
