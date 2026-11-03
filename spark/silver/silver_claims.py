"""silver/claims — typed, deduplicated claims conformed to the policy dim.

    spark-submit spark/silver/silver_claims.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import Window  # noqa: E402
from pyspark.sql import functions as F

from common.config import get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("silver.claims")


def main() -> None:
    spark = get_spark("silver-claims")
    df = load("bronze", "claims")

    latest = Window.partitionBy("claim_id").orderBy(F.col("_loaded_at").desc())
    df = (df.withColumn("_rn", F.row_number().over(latest))
            .filter("_rn = 1").drop("_rn", "_loaded_at", "_source_file", "_dt"))

    out = (
        df.select(
            "claim_id", "policy_id",
            F.to_date("loss_date").alias("loss_date"),
            F.to_date("report_date").alias("report_date"),
            F.col("reported_lag_days").cast("int").alias("reported_lag_days"),
            "peril",
            F.col("claim_amount").cast("double").alias("claim_amount"),
            F.col("paid_amount").cast("double").alias("paid_amount"),
            F.col("reserve_amount").cast("double").alias("reserve_amount"),
            "status",
            F.to_date("closed_date").alias("closed_date"),
            F.col("night_indicator").cast("boolean").alias("night_indicator"),
            F.col("prior_claims").cast("int").alias("prior_claims"),
            F.col("fraud_flag").cast("boolean").alias("fraud_flag"),
            F.col("fraud_probability").cast("double").alias("fraud_probability"),
        )
        .filter(F.col("claim_amount") > 0)
        .join(
            load("silver", "policies").select(
                F.col("policy_id").alias("_pid"),
                F.col("product").alias("product"),
                F.col("region").alias("region")),
            df.policy_id == F.col("_pid"), "left",
        )
        .drop("_pid")
    )
    save(out, layer_path("silver", "claims"))
    log.info("silver/claims: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
