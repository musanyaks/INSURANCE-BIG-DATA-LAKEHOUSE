"""gold/portfolio_kpis — monthly P&C KPIs per product: GWP, earned premium,
loss ratio, frequency, severity, combined ratio, fraud rate.

    spark-submit spark/gold/gold_portfolio_kpis.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import functions as F  # noqa: E402

from common.config import DATA_END, get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("gold.portfolio_kpis")

EXPENSE_RATIO = 0.15  # assumed management expense load


def main() -> None:
    spark = get_spark("gold-portfolio-kpis")
    pol = load("silver", "policies")
    clm = load("silver", "claims")

    # policy-months in force (earned premium basis)
    pm = pol.withColumn(
        "month",
        F.explode(F.sequence(
            F.trunc("effective_date", "MM"),
            F.trunc(F.least(F.col("expiry_date"), F.lit(DATA_END)), "MM"),
            F.expr("interval 1 month"))),
    )
    pagg = pm.groupBy("product", "month").agg(
        F.countDistinct("policy_id").alias("policies_inforce"),
        F.sum(F.col("annual_premium") / 12).alias("earned_premium"))

    # written premium in month (GWP)
    gwp = (pol.withColumn("month", F.trunc("effective_date", "MM"))
           .groupBy("product", "month").agg(F.sum("annual_premium").alias("gwp")))

    # claims incurred by loss month
    cagg = (clm.withColumn("month", F.trunc("loss_date", "MM"))
            .groupBy("product", "month").agg(
                F.count("claim_id").alias("n_claims"),
                F.sum("claim_amount").alias("incurred"),
                F.sum("paid_amount").alias("paid"),
                F.sum(F.col("fraud_flag").cast("int")).alias("fraud")))

    out = (pagg.join(gwp, on=["product", "month"], how="left")
           .join(cagg, on=["product", "month"], how="left")
           .fillna(0, subset=["gwp", "n_claims", "incurred", "paid", "fraud"])
           .withColumn("claim_frequency",
                       F.round(F.col("n_claims") / F.nullif(F.col("policies_inforce"),
                                                            F.lit(0)), 4))
           .withColumn("avg_severity",
                       F.round(F.col("incurred") / F.nullif(F.col("n_claims"), F.lit(0)), 2))
           .withColumn("loss_ratio",
                       F.round(F.col("incurred") / F.nullif(F.col("earned_premium"),
                                                            F.lit(0.0)), 4))
           .withColumn("expense_ratio", F.lit(EXPENSE_RATIO))
           .withColumn("combined_ratio",
                       F.round(F.coalesce(F.col("loss_ratio"), F.lit(0.0)) + EXPENSE_RATIO, 4))
           .withColumn("fraud_rate",
                       F.round(F.col("fraud") / F.nullif(F.col("n_claims"), F.lit(0)), 4))
           .withColumn("month", F.date_format("month", "yyyy-MM"))
           .orderBy("month", "product"))

    keep = ["month", "product", "policies_inforce", "gwp", "earned_premium", "n_claims",
            "claim_frequency", "avg_severity", "incurred", "paid", "loss_ratio",
            "expense_ratio", "combined_ratio", "fraud_rate"]
    save(out.select(*keep), layer_path("gold", "portfolio_kpis"))
    log.info("gold/portfolio_kpis: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
