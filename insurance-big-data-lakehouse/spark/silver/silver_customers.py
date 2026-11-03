"""silver/customers — customer dimension with age banding.

    spark-submit spark/silver/silver_customers.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import Window  # noqa: E402
from pyspark.sql import functions as F

from common.config import get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("silver.customers")


def main() -> None:
    spark = get_spark("silver-customers")
    df = load("bronze", "customers")

    latest = Window.partitionBy("customer_id").orderBy(F.col("_loaded_at").desc())
    df = (df.withColumn("_rn", F.row_number().over(latest))
            .filter("_rn = 1").drop("_rn", "_loaded_at", "_source_file", "_dt"))

    age = F.col("age").cast("int")
    out = df.select(
        "customer_id", "name", age.alias("age"), "region",
        F.to_date("customer_since").alias("customer_since"), "credit_band",
        F.when(age < 26, "18-25").when(age < 36, "26-35")
         .when(age < 51, "36-50").when(age < 66, "51-65").otherwise("65+")
         .alias("age_band"),
    )
    save(out, layer_path("silver", "customers"))
    log.info("silver/customers: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
