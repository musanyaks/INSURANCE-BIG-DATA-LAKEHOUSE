"""bronze/claims — raw capture of the claims FNOL stream with lineage metadata.

    spark-submit spark/bronze/bronze_claims.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import functions as F  # noqa: E402

from common.config import get_logger, landing_path, layer_path  # noqa: E402
from spark.common_spark import get_spark, save  # noqa: E402

log = get_logger("bronze.claims")


def main() -> None:
    spark = get_spark("bronze-claims")
    raw = (
        spark.read.json(f"{landing_path('stream', 'claims')}/dt=*/part-*.jsonl")
        .withColumn("_source_file", F.input_file_name())
        .withColumn("_dt", F.regexp_extract("_source_file", r"dt=(\d{4}-\d{2}-\d{2})", 1))
        .withColumn("_loaded_at", F.current_timestamp())
    )
    save(raw, layer_path("bronze", "claims"))
    log.info("bronze/claims: %d rows", raw.count())
    spark.stop()


if __name__ == "__main__":
    main()
