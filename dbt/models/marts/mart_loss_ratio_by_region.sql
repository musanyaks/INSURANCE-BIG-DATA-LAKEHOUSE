-- Loss ratio by region and product (actual, over the observation window)
select
    region,
    product,
    count(distinct claim_id)                          as claims,
    sum(incurred)                                     as incurred,
    sum(paid)                                         as paid,
    sum(earned_premium)                               as earned_premium,
    round(sum(incurred) / nullif(sum(earned_premium), 0), 4) as loss_ratio,
    round(sum(case when fraud_flag then 1 else 0 end) * 1.0
          / nullif(count(distinct claim_id), 0), 4)   as fraud_rate
from {{ ref('fct_claims') }}
group by region, product
order by loss_ratio desc
