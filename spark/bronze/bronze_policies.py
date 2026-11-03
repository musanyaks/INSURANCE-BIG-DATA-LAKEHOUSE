"""bronze/policies + bronze/customers — batch capture of the policy admin
system extracts (the same job covers both system-of-record tables).

    spark-submit spark/bronze/bronze_policies.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import functions as F  # noqa: E402

from common.config import get_logger, landing_path, layer_path  # noqa: E402
from spark.common_spark import get_spark, save  # noqa: E402

log = get_logger("bronze.policies")


def _capture(spark, source: str, dataset: str):
    raw = (
        spark.read.json(f"{landing_path(source, dataset)}/dt=*/part-*.jsonl")
        .withColumn("_source_file", F.input_file_name())
        .withColumn("_dt", F.regexp_extract("_source_file", r"dt=(\d{4}-\d{2}-\d{2})", 1))
        .withColumn("_loaded_at", F.current_timestamp())
    )
    save(raw, layer_path("bronze", dataset))
    log.info("bronze/%s: %d rows", dataset, raw.count())


def main() -> None:
    spark = get_spark("bronze-policies")
    _capture(spark, "database", "policies")
    _capture(spark, "database", "customers")
    spark.stop()


if __name__ == "__main__":
    main()
