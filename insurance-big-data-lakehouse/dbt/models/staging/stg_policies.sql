-- Conformed policy dimension
select
    policy_id,
    customer_id,
    product,
    sub_product,
    region,
    distribution_channel          as channel,
    effective_date,
    expiry_date,
    annual_premium,
    sum_insured,
    status,
    churned
from {{ source('lakehouse_silver', 'policies') }}
where annual_premium > 0
