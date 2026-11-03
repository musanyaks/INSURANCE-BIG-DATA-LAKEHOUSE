"""silver/policies — typed, deduplicated, conformed policy dimension.

    spark-submit spark/silver/silver_policies.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import Window  # noqa: E402
from pyspark.sql import functions as F

from common.config import get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("silver.policies")

VALID_STATUS = ["Active", "Renewed", "Lapsed", "Cancelled"]


def main() -> None:
    spark = get_spark("silver-policies")
    df = load("bronze", "policies")

    latest = Window.partitionBy("policy_id").orderBy(F.col("_loaded_at").desc())
    df = (df.withColumn("_rn", F.row_number().over(latest))
            .filter("_rn = 1").drop("_rn", "_loaded_at", "_source_file", "_dt"))

    if "finance_stress" not in df.columns:
        df = df.withColumn("finance_stress", F.lit(0.05))
    if "driver_aggressiveness" not in df.columns:
        df = df.withColumn("driver_aggressiveness", F.lit(None).cast("double"))

    out = (
        df.select(
            "policy_id", "customer_id", "product", "sub_product", "region",
            F.col("distribution_channel").alias("channel"),
            F.to_date("effective_date").alias("effective_date"),
            F.to_date("expiry_date").alias("expiry_date"),
            F.col("annual_premium").cast("double").alias("annual_premium"),
            F.col("sum_insured").cast("double").alias("sum_insured"),
            "status",
            F.col("driver_aggressiveness").cast("double"),
            F.col("finance_stress").cast("double"),
            F.col("churned").cast("int").alias("churned"),
        )
        .filter(F.col("status").isin(VALID_STATUS))
        .filter((F.col("annual_premium") > 0) & (F.col("sum_insured") > 0))
    )
    save(out, layer_path("silver", "policies"))
    log.info("silver/policies: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
