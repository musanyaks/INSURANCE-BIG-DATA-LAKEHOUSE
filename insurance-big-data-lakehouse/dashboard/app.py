"""Meridian Mutual — Lakehouse Executive Dashboard (Streamlit).

Reads only gold-layer marts + actuarial outputs; no direct silver/bronze access.

    streamlit run dashboard/app.py         # http://localhost:8501
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common.config import REPO_ROOT, get_logger, layer_path  # noqa: E402
from common.io import read_table  # noqa: E402

log = get_logger("dashboard")
st.set_page_config(page_title="Meridian Lakehouse", page_icon="🛡️", layout="wide")


@st.cache_data(ttl=300)
def load(dataset: str) -> pd.DataFrame | None:
    try:
        return read_table(layer_path("gold", dataset))
    except Exception:
        return None


@st.cache_data(ttl=600)
def load_actuarial() -> tuple[dict | None, pd.DataFrame | None, pd.DataFrame | None]:
    base = REPO_ROOT / "actuarial" / "reserving" / "output"
    try:
        summary = json.loads((base / "reserve_summary.json").read_text())
        triangle = pd.read_csv(base / "paid_triangle.csv", index_col=0)
        by_acc = pd.read_csv(base / "reserves_by_accident_quarter.csv")
        return summary, triangle, by_acc
    except Exception:
        return None, None, None


def fmt_money(x: float) -> str:
    if abs(x) >= 1e9:
        return f"${x/1e9:,.2f}B"
    if abs(x) >= 1e6:
        return f"${x/1e6:,.2f}M"
    return f"${x/1e3:,.0f}K"


# ── data readiness (loaded first — the sidebar needs it) ────────────────────
kpis = load("portfolio_kpis")
perf = load("policy_performance")
claims_daily = load("claims_daily")
fraud = load("fraud_scores")
beh = load("telematics_behavior")

if kpis is None or perf is None:
    st.error("Gold marts not found. Run the demo pipeline first:  `make demo`")
    st.stop()

# ── sidebar filters ──────────────────────────────────────────────────────────
st.sidebar.title("🛡️ Meridian Mutual")
st.sidebar.caption("Insurance Big-Data Lakehouse · gold layer")
products_all = ["Motor", "Home", "Health"]
products = st.sidebar.multiselect("Products", products_all, default=products_all)

st.sidebar.divider()
st.sidebar.subheader("Fraud alerting")
default_thr = (float(fraud.fraud_probability.quantile(0.90))
               if fraud is not None and len(fraud) else 0.30)
thr = st.sidebar.slider("Score threshold", 0.0, 1.0, default_thr, 0.05)

with st.sidebar.expander("ℹ️ Data source"):
    st.markdown(
        "Tables: `lakehouse/gold/*` (Delta/Parquet)\n\n"
        "Regenerate with:\n\n"
        "```\nmake demo\nmake api   # or make dashboard\n```")

k = kpis[kpis["product"].isin(products)]
p = perf[perf["product"].isin(products)]

st.title("🛡️ Meridian Mutual — Portfolio Command Center")
st.caption(f"Gold-layer analytics · generated from the medallion pipeline · "
           f"{len(p):,} policies in scope")

tab1, tab2, tab3, tab4, tab5 = st.tabs(
    ["📊 Portfolio", "🚨 Claims", "🕵️ Fraud", "🚗 Telematics", "📈 Reserving"])

# ─────────────────────────────────────────────────────────────────────────────
with tab1:
    latest_month = k.month.max()
    latest = k[k.month == latest_month]
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("GWP (latest month)", fmt_money(latest.gwp.sum()))
    c2.metric("Earned premium", fmt_money(latest.earned_premium.sum()))
    lr = latest.incurred.sum() / max(latest.earned_premium.sum(), 1)
    c3.metric("Loss ratio", f"{lr:.1%}", delta=f"{lr - 0.68:+.1%} vs target",
              delta_color="inverse")
    c4.metric("Combined ratio", f"{latest.combined_ratio.mean():.1%}")
    c5.metric("Policies in force", f"{int(latest.policies_inforce.sum()):,}")

    colA, colB = st.columns(2)
    with colA:
        st.subheader("Monthly loss ratio by product")
        fig = px.line(k, x="month", y="loss_ratio", color="product", markers=True,
                      labels={"loss_ratio": "Loss ratio", "month": ""})
        fig.add_hline(y=0.68, line_dash="dot", annotation_text="target 68%")
        fig.update_layout(height=340, yaxis_tickformat=".0%")
        st.plotly_chart(fig, use_container_width=True)
    with colB:
        st.subheader("Gross written premium")
        fig = px.bar(k, x="month", y="gwp", color="product",
                     labels={"gwp": "GWP", "month": ""})
        fig.update_layout(height=340, yaxis_tickformat="$,.0f")
        st.plotly_chart(fig, use_container_width=True)

    st.subheader("Incurred vs earned premium")
    fig = go.Figure()
    g = k.groupby("month")[["incurred", "earned_premium"]].sum().reset_index()
    fig.add_trace(go.Scatter(x=g.month, y=g.incurred, name="Incurred", fill="tozeroy"))
    fig.add_trace(go.Scatter(x=g.month, y=g.earned_premium, name="Earned premium"))
    fig.update_layout(height=320, yaxis_tickformat="$,.0f", legend_orientation="h")
    st.plotly_chart(fig, use_container_width=True)

# ─────────────────────────────────────────────────────────────────────────────
with tab2:
    c1, c2, c3 = st.columns(3)
    c1.metric("Claims (window)", f"{int(p.n_claims.sum()):,}")
    c2.metric("Open claims", f"{int(p.open_claims.sum()):,}")
    sev = p.incurred.sum() / max(p.n_claims.sum(), 1)
    c3.metric("Avg severity", fmt_money(sev))

    colA, colB = st.columns(2)
    with colA:
        st.subheader("Claims by product")
        if claims_daily is not None:
            cd = claims_daily[claims_daily["product"].isin(products)]
            fig = px.bar(cd.groupby("product", as_index=False).n_claims.sum(),
                         x="product", y="n_claims", color="product",
                         labels={"n_claims": "Claims"})
            fig.update_layout(height=340, showlegend=False)
            st.plotly_chart(fig, use_container_width=True)
    with colB:
        st.subheader("Loss ratio — region × product")
        inc = p.pivot_table(index="region", columns="product", values="incurred",
                            aggfunc="sum").fillna(0)
        ear = p.pivot_table(index="region", columns="product", values="earned_premium",
                            aggfunc="sum").fillna(1)
        heat = (inc / ear.replace(0, np.nan)).fillna(0)
        fig = px.imshow(heat, text_auto=".0%", aspect="auto",
                        color_continuous_scale="RdYlGn_r")
        fig.update_layout(height=340)
        st.plotly_chart(fig, use_container_width=True)

    if claims_daily is not None:
        st.subheader("Daily claims pattern")
        daily = (claims_daily[claims_daily["product"].isin(products)]
                 .groupby("loss_date", as_index=False)[["n_claims", "incurred"]].sum()
                 .sort_values("loss_date"))
        fig = px.area(daily, x="loss_date", y="incurred", labels={"incurred": "Incurred ($)"})
        fig.update_layout(height=300, yaxis_tickformat="$,.0f")
        st.plotly_chart(fig, use_container_width=True)

# ─────────────────────────────────────────────────────────────────────────────
with tab3:
    if fraud is None or fraud.empty:
        st.info("Fraud mart is empty — run `make demo`.")
    else:
        alerts = fraud[fraud.fraud_probability >= thr]
        c1, c2, c3 = st.columns(3)
        c1.metric("Alerts at threshold", f"{len(alerts):,}")
        c2.metric("Confirmed fraud cases", f"{int(fraud.fraud_flag.sum()):,}")
        c3.metric("SIU referrals", f"{int(fraud.siu_outcome.notna().sum()):,}")

        colA, colB = st.columns([3, 2])
        with colA:
            fig = px.histogram(fraud, x="fraud_probability", nbins=40,
                               labels={"fraud_probability": "Fraud score"})
            fig.add_vline(x=thr, line_dash="dot", annotation_text="threshold")
            fig.update_layout(height=330)
            st.plotly_chart(fig, use_container_width=True)
        with colB:
            fig = px.pie(alerts, names="alert_priority", hole=0.55, title="Alert triage mix")
            fig.update_layout(height=330)
            st.plotly_chart(fig, use_container_width=True)

        st.subheader(f"Top alerts (threshold ≥ {thr:.2f})")
        st.dataframe(alerts.sort_values("fraud_probability", ascending=False)
                     .head(15)[["claim_id", "fraud_probability", "alert_priority",
                                "siu_outcome", "report_date"]],
                     use_container_width=True, hide_index=True)

# ─────────────────────────────────────────────────────────────────────────────
with tab4:
    if beh is None or beh.empty:
        st.info("Telematics mart is empty — run `make demo`.")
    else:
        merged = p.drop(columns=["driving_score"], errors="ignore").merge(beh, on="policy_id", how="inner")
        c1, c2, c3 = st.columns(3)
        c1.metric("Policies with telematics", f"{len(merged):,}")
        c2.metric("Median driving score", f"{beh.driving_score.median():.0f}")
        c3.metric("Mileage tracked", fmt_money(beh.mileage_km.sum()) if len(beh) else "—")

        st.subheader("Driving score vs loss ratio")
        fig = px.scatter(merged[merged.driving_score.notna()],
                         x="driving_score", y="loss_ratio", color="product",
                         opacity=0.55, trendline="lowess",
                         labels={"driving_score": "Driving score (higher = safer)",
                                 "loss_ratio": "Loss ratio"})
        fig.update_layout(height=420, yaxis_tickformat=".0%")
        st.plotly_chart(fig, use_container_width=True)

        fig = px.histogram(beh, x="driving_score", nbins=35,
                           color_discrete_sequence=["#2E86AB"])
        fig.update_layout(height=300)
        st.plotly_chart(fig, use_container_width=True)

# ─────────────────────────────────────────────────────────────────────────────
with tab5:
    summary, triangle, by_acc = load_actuarial()
    if summary is None:
        st.info("Reserving outputs not found — run `make actuarial`.")
    else:
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Paid to date", fmt_money(summary["paid_to_date"]))
        c2.metric("Ultimate estimate", fmt_money(summary["ultimate_estimate"]))
        c3.metric("Total reserve", fmt_money(summary["total_reserve"]))
        c4.metric("Reserve p95", fmt_money(summary["reserve_p95"]))
        st.caption(f"Method: {summary['method']} · valuation {summary['valuation_date']} · "
                   f"{summary['accident_quarters']} accident quarters")

        colA, colB = st.columns(2)
        with colA:
            st.subheader("Cumulative paid triangle")
            fig = px.imshow(triangle, aspect="auto", color_continuous_scale="Blues",
                            labels=dict(color="Cumulative paid"))
            fig.update_layout(height=380)
            st.plotly_chart(fig, use_container_width=True)
        with colB:
            st.subheader("Reserve by accident quarter")
            fig = px.bar(by_acc, x="accident_quarter", y="reserve",
                         labels={"reserve": "Reserve ($)", "accident_quarter": ""})
            fig.update_layout(height=380, yaxis_tickformat="$,.0f")
            st.plotly_chart(fig, use_container_width=True)
