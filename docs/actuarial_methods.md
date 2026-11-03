# Actuarial Methods

## Overview

The `actuarial/` package implements the classic P&C analytics stack on the
silver/gold lakehouse layers, with every output written to
`actuarial/<module>/output/` and summarised in `actuarial/summary.json`.

```
frequency GLM ──┐
                ├─► pricing indication ──► adequacy review
severity GLM ───┘
paid claims ──► chain ladder ──► reserve + bootstrap range
```

## 1. Frequency model — Poisson GLM

`actuarial/frequency/frequency_model.py`

* Target: claim counts per policy; **offset**: `log(exposure years)`.
* Rating factors: product, region, age band, standardised telematics
  driving score.
* `statsmodels` GLM with `family=Poisson`, log link. Degenerate small
  samples automatically fall back to an L2-regularised fit.

## 2. Severity model — Gamma GLM

`actuarial/severity/severity_model.py`

* Target: paid claim amounts on settled claims; log link Gamma family
  (right-skewed severities), plus a peril-level median index.

## 3. Pure-premium pricing indication

`actuarial/pricing/pricing_glm.py`

```
pure premium   = predicted frequency × predicted severity
gross premium  = pure premium / target loss ratio (68%)
adequacy index = indicated gross ÷ current average premium
```

Outputs `rate_factors.csv` for all 15 product × region segments with a
suggested rate action (Increase / Hold / Decrease at ±10%).

## 4. Adequacy review

`actuarial/pricing/pricing_adequacy.py`

Actual vs target loss ratio per segment from the gold
`policy_performance` mart; portfolio and segment A/E indices in
`adequacy_by_segment.csv`.

## 5. Chain-ladder reserving

`actuarial/reserving/chain_ladder.py`

1. **Triangle build** — cumulative *paid* by accident quarter × development
   quarter. A claim's payments land in the quarter it settled (open claims sit
   on the valuation diagonal with their part-paid amount).
2. **Volume-weighted age-to-age factors**
   `f_k = Σ C_{i,k+1} / Σ C_{i,k}` and CDFs to ultimate.
3. **Ultimates & reserve** — latest diagonal × CDF; total unpaid =
   ultimate − paid-to-date.
4. **Uncertainty** — 500-iteration nonparametric bootstrap: exposure cells
   `(C_{i,k}, C_{i,k+1})` are resampled per development period, volume-weighted
   LDFs recomputed, and the p50/p75/p95 of total reserve reported.

The pure function `chain_ladder_from_triangle()` is unit-tested against a
hand-checkable triangle in `tests/test_chain_ladder.py`.

## Reading the outputs

| File | Contents |
|---|---|
| `reserving/output/reserve_summary.json` | paid-to-date, ultimate, reserve, percentiles |
| `reserving/output/paid_triangle.csv` | cumulative paid triangle |
| `reserving/output/reserves_by_accident_quarter.csv` | per-cohort ultimates |
| `pricing/output/rate_factors.csv` | indicated premiums per segment |
| `pricing/output/adequacy_by_segment.csv` | actual-vs-target LR review |
| `frequency/output/frequency_glm.json` | coefficients, empirical frequency |

All numbers flow into the dashboard's **Reserving** tab and the API at
`GET /reserving/summary`.
