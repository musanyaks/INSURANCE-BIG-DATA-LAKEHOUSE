"""gold/fraud_scores — fraud model output joined with SIU alert outcomes.

    spark-submit spark/gold/gold_fraud_scores.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import Window  # noqa: E402
from pyspark.sql import functions as F

from common.config import get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("gold.fraud_scores")


def main() -> None:
    spark = get_spark("gold-fraud-scores")
    clm = load("silver", "claims").filter(F.col("fraud_probability").isNotNull())

    alerts = load("bronze", "fraud")
    latest = Window.partitionBy("alert_id").orderBy(F.col("_loaded_at").desc())
    alerts = (alerts.withColumn("_rn", F.row_number().over(latest))
              .filter("_rn = 1")
              .select("claim_id", "siu_outcome"))

    out = (clm.join(alerts, on="claim_id", how="left")
           .withColumn("alert_priority",
                       # quantile-based triage: High = top 5%, Medium = next 10%
                       F.when(F.col("fraud_probability")
                              >= F.percentile_approx("fraud_probability", 0.95)
                              .over(Window.partitionBy()), "High")
                       .when(F.col("fraud_probability")
                             >= F.percentile_approx("fraud_probability", 0.85)
                             .over(Window.partitionBy()), "Medium")
                       .otherwise("Low"))
           .select("claim_id", "fraud_probability", "fraud_flag", "report_date",
                   "siu_outcome", "alert_priority"))
    save(out, layer_path("gold", "fraud_scores"))
    log.info("gold/fraud_scores: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
