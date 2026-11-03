"""silver/telematics — cleaned driving-event pings.

    spark-submit spark/silver/silver_telematics.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import Window  # noqa: E402
from pyspark.sql import functions as F

from common.config import get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("silver.telematics")


def main() -> None:
    spark = get_spark("silver-telematics")
    df = load("bronze", "telematics")

    latest = Window.partitionBy("ping_id").orderBy(F.col("_loaded_at").desc())
    df = (df.withColumn("_rn", F.row_number().over(latest))
            .filter("_rn = 1").drop("_rn", "_loaded_at", "_source_file", "_dt"))

    out = (
        df.select(
            "ping_id", "policy_id",
            F.to_timestamp("ping_ts").alias("ping_ts"),
            F.least(F.greatest(F.col("speed_kph").cast("double"), F.lit(0.0)),
                    F.lit(200.0)).alias("speed_kph"),
            F.col("harsh_braking").cast("boolean").alias("harsh_braking"),
            F.col("harsh_accel").cast("boolean").alias("harsh_accel"),
            F.col("night_trip").cast("boolean").alias("night_trip"),
            F.col("odometer_km").cast("double").alias("odometer_km"),
        )
        .filter(F.col("odometer_km") >= 0)
    )
    save(out, layer_path("silver", "telematics"))
    log.info("silver/telematics: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
