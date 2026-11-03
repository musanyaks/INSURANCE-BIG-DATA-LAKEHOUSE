"""gold/customer_360 — single customer view: book, claims, payments, CLV.

    spark-submit spark/gold/gold_customer_360.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pyspark.sql import functions as F  # noqa: E402

from common.config import DATA_END, get_logger, layer_path  # noqa: E402
from spark.common_spark import get_spark, load, save  # noqa: E402

log = get_logger("gold.customer_360")


def main() -> None:
    spark = get_spark("gold-customer-360")
    cus = load("silver", "customers")
    pol = load("silver", "policies").select("policy_id", "customer_id", "annual_premium",
                                            "churned")
    clm = load("silver", "claims").select("claim_id", "policy_id", "status")
    pay = load("silver", "payments").select("payment_id", "policy_id", "status")

    polagg = pol.groupBy("customer_id").agg(
        F.count("policy_id").alias("n_policies"),
        F.sum("annual_premium").alias("total_premium"),
        F.max("churned").alias("churned"))

    clmagg = (clm.join(pol, on="policy_id").groupBy("customer_id").agg(
        F.count("claim_id").alias("n_claims"),
        F.sum(F.when(F.col("status") == "Open", 1).otherwise(0)).alias("open_claims")))

    fails = (pay.filter(F.col("status") != "Paid").join(pol, on="policy_id")
             .groupBy("customer_id").agg(F.count("payment_id").alias("payment_failures")))

    out = (cus
           .join(polagg, on="customer_id", how="left")
           .join(clmagg, on="customer_id", how="left")
           .join(fails, on="customer_id", how="left")
           .fillna(0, subset=["n_policies", "total_premium", "churned", "n_claims",
                              "open_claims", "payment_failures"])
           .withColumn("tenure_months", F.round(
               F.months_between(F.lit(DATA_END), F.col("customer_since")), 1))
           .withColumn("clv_estimate",
                       F.round(F.col("total_premium") * 1.6 - F.col("n_claims") * 3000, 2)))

    keep = ["customer_id", "name", "age_band", "region", "tenure_months", "n_policies",
            "total_premium", "n_claims", "open_claims", "payment_failures", "churned",
            "clv_estimate"]
    save(out.select(*keep), layer_path("gold", "customer_360"))
    log.info("gold/customer_360: %d rows", out.count())
    spark.stop()


if __name__ == "__main__":
    main()
