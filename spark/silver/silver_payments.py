"""silver/payments — typed premium payment transactions.

    spark-submit spark/silver/silver_payments.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import Window  # noqa: E402
from pyspark.sql import functions as F

from common.config import get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("silver.payments")


def main() -> None:
    spark = get_spark("silver-payments")
    df = load("bronze", "payments")

    latest = Window.partitionBy("payment_id").orderBy(F.col("_loaded_at").desc())
    df = (df.withColumn("_rn", F.row_number().over(latest))
            .filter("_rn = 1").drop("_rn", "_loaded_at", "_source_file", "_dt"))

    out = (
        df.select(
            "payment_id", "policy_id",
            F.to_date("due_date").alias("due_date"),
            F.col("amount").cast("double").alias("amount"),
            "status", "method",
        )
        .filter(F.col("status").isin(["Paid", "Failed", "Returned"]))
        .filter(F.col("amount") > 0)
    )
    save(out, layer_path("silver", "payments"))
    log.info("silver/payments: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
