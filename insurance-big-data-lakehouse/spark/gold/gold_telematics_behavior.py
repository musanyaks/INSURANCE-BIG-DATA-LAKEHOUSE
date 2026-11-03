"""gold/telematics_behavior — per-policy driving behaviour scorecard.

    spark-submit spark/gold/gold_telematics_behavior.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import functions as F  # noqa: E402

from common.config import get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("gold.telematics_behavior")


def main() -> None:
    spark = get_spark("gold-telematics-behavior")
    tel = load("silver", "telematics")

    g = tel.groupBy("policy_id").agg(
        F.count("ping_id").alias("pings"),
        (F.max("odometer_km") - F.min("odometer_km")).alias("mileage_km"),
        F.avg(F.col("harsh_braking").cast("double")).alias("harsh_braking_rate"),
        F.avg(F.col("harsh_accel").cast("double")).alias("harsh_accel_rate"),
        F.avg(F.col("night_trip").cast("double")).alias("night_rate"),
        F.avg("speed_kph").alias("avg_speed_kph"),
    )
    score = 100 * (1 - 2.2 * F.col("harsh_braking_rate")
                   - 1.4 * F.col("harsh_accel_rate") - 0.35 * F.col("night_rate"))
    out = g.withColumn(
        "driving_score", F.least(F.greatest(score, F.lit(5.0)), F.lit(100.0)).cast("decimal(5,1)")
    )
    save(out, layer_path("gold", "telematics_behavior"))
    log.info("gold/telematics_behavior: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
