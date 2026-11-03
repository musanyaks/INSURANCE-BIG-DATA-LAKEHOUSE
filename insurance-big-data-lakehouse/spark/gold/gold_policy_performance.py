"""gold/policy_performance — the flagship policy-level mart: exposure, claims,
loss ratio, driving score and risk tier in one row per policy.

    spark-submit spark/gold/gold_policy_performance.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import functions as F  # noqa: E402

from common.config import DATA_END, get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("gold.policy_performance")


def main() -> None:
    spark = get_spark("gold-policy-performance")
    pol = load("silver", "policies")
    clm = load("silver", "claims")

    end = F.least(F.col("expiry_date"), F.lit(DATA_END))
    exposure = F.greatest(
        F.months_between(end, F.col("effective_date")), F.lit(1.0))

    cagg = clm.groupBy("policy_id").agg(
        F.count("claim_id").alias("n_claims"),
        F.sum("claim_amount").alias("incurred"),
        F.sum("paid_amount").alias("paid"),
        F.sum(F.when(F.col("status") == "Open", 1).otherwise(0)).alias("open_claims"),
        F.sum(F.col("fraud_flag").cast("int")).alias("fraud_claims"),
    )

    df = (pol
          .withColumn("months_exposure", F.round(exposure, 1))
          .join(cagg, on="policy_id", how="left")
          .fillna(0, subset=["n_claims", "incurred", "paid", "open_claims", "fraud_claims"]))

    df = df.withColumn(
        "earned_premium", F.round(F.col("annual_premium") * F.col("months_exposure") / 12, 2)
    ).withColumn(
        "loss_ratio",
        F.round(F.col("incurred") / F.nullif(F.col("earned_premium"), F.lit(0.0)), 4),
    )

    try:  # driving score only exists for motor policies with telematics
        beh = load("gold", "telematics_behavior").select("policy_id", "driving_score")
        df = df.join(beh, on="policy_id", how="left")
    except Exception:
        df = df.withColumn("driving_score", F.lit(None).cast("double"))

    tier = (F.when((F.col("driving_score").isNotNull()) & (F.col("driving_score") < 45), 5)
             .when(F.col("n_claims") >= 3, 5)
             .when((F.col("n_claims") == 2)
                   | ((F.col("driving_score").isNotNull()) & (F.col("driving_score") < 60)), 4)
             .when(F.col("n_claims") == 1, 3)
             .when((F.col("driving_score").isNotNull()) & (F.col("driving_score") < 75), 2)
             .otherwise(1))
    df = df.withColumn("risk_tier", tier)

    keep = ["policy_id", "customer_id", "product", "sub_product", "region", "channel",
            "effective_date", "expiry_date", "status", "annual_premium", "sum_insured",
            "months_exposure", "earned_premium", "n_claims", "open_claims", "fraud_claims",
            "incurred", "paid", "loss_ratio", "driving_score", "risk_tier", "churned"]
    out = df.select(*keep)
    save(out, layer_path("gold", "policy_performance"))
    log.info("gold/policy_performance: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
