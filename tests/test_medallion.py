"""Medallion (pandas reference) pipeline tests."""
from __future__ import annotations

from common.config import layer_path
from common.io import read_table


def test_gold_tables_populated(medallion):
    perf = read_table(layer_path("gold", "policy_performance"))
    kpis = read_table(layer_path("gold", "portfolio_kpis"))
    assert len(perf) > 100
    assert len(kpis) > 12  # multiple months × products


def test_kpis_are_sane(medallion):
    kpis = read_table(layer_path("gold", "portfolio_kpis"))
    # monthly product cells are volatile (cat perils on tiny in-force books) —
    # the upper bound applies to cells with meaningful exposure, like the DQ suite
    assert (kpis.loss_ratio.fillna(0) >= 0).all()
    big = kpis[kpis.policies_inforce >= 100]
    assert big.loss_ratio.between(0.0, 10.0).all()
    assert big.combined_ratio.between(0.15, 10.2).all()
    assert kpis.earned_premium.sum() > 0
    assert kpis.month.nunique() >= 12


def test_policy_performance_integrity(medallion):
    perf = read_table(layer_path("gold", "policy_performance"))
    silver_policies = read_table(layer_path("silver", "policies"))
    assert len(perf) == len(silver_policies)
    assert perf.loss_ratio.notna().all()
    assert (perf.earned_premium > 0).all()
    ds = perf.driving_score.dropna()
    if len(ds):
        assert ds.between(5, 100).all()
    assert perf.risk_tier.between(1, 5).all()


def test_silver_deduplicated(medallion):
    for dataset, key in [("policies", "policy_id"), ("claims", "claim_id"),
                         ("payments", "payment_id")]:
        df = read_table(layer_path("silver", dataset))
        assert df[key].is_unique, f"{dataset} has duplicate {key}"
