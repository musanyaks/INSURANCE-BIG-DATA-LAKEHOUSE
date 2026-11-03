-- Conformed claim facts with policy attributes joined
select
    c.claim_id,
    c.policy_id,
    p.product,
    p.region,
    p.channel,
    c.loss_date,
    c.report_date,
    c.reported_lag_days,
    c.peril,
    c.claim_amount,
    c.paid_amount,
    c.reserve_amount,
    c.status,
    c.night_indicator,
    c.prior_claims,
    c.fraud_flag
from {{ source('lakehouse_silver', 'claims') }} c
left join {{ ref('stg_policies') }} p
       on c.policy_id = p.policy_id
