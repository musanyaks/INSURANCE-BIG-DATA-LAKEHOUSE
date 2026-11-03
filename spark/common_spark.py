"""SparkSession factory shared by all medallion jobs.

Configures Delta Lake (when enabled) and S3A/MinIO credentials from
environment variables. Falls back to plain Parquet when delta-spark is not
available so the jobs remain runnable on minimal images.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from common.config import (  # noqa: E402
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    DELTA_ENABLED,
    S3_ENDPOINT,
    get_logger,
    layer_path,
)

log = get_logger("spark")


def get_spark(app_name: str):
    from pyspark.sql import SparkSession

    builder = (
        SparkSession.builder.appName(app_name)
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.hadoop.fs.s3a.access.key", AWS_ACCESS_KEY_ID)
        .config("spark.hadoop.fs.s3a.secret.key", AWS_SECRET_ACCESS_KEY)
        .config("spark.hadoop.fs.s3a.endpoint", S3_ENDPOINT)
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false")
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        .config("spark.sql.sources.commitProtocolClass",
                "org.apache.spark.sql.execution.datasources.SQLHadoopMapReduceCommitProtocol")
    )
    if DELTA_ENABLED:
        builder = builder.config(
            "spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension"
        ).config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        try:
            from delta import configure_spark_with_delta_pip

            log.info("Delta Lake enabled for %s", app_name)
            return configure_spark_with_delta_pip(builder).getOrCreate()
        except ImportError:
            log.warning("delta-spark not installed — writing plain Parquet instead")
    return builder.getOrCreate()


def save(df, path: str) -> None:
    """Write a DataFrame as Delta (or Parquet fallback), idempotent overwrite."""
    fmt = "delta" if DELTA_ENABLED else "parquet"
    df.write.format(fmt).mode("overwrite").save(path)
    log.info("Wrote %s dataset → %s", fmt, path)


def load(layer: str, dataset: str):
    """Read back a medallion dataset as a Spark DataFrame."""
    from pyspark.sql import SparkSession

    spark = SparkSession.getActiveSession()
    fmt = "delta" if DELTA_ENABLED else "parquet"
    return spark.read.format(fmt).load(layer_path(layer, dataset))
