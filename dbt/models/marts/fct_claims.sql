-- Claim-level fact table: one row per claim with policy exposure context
with policy_exposure as (
    select
        policy_id,
        annual_premium,
        greatest(1.0, date_diff('month', effective_date,
                 least(expiry_date, date '2026-10-31')) ) as months_exposure
    from {{ ref('stg_policies') }}
)
select
    c.claim_id,
    c.policy_id,
    c.product,
    c.region,
    c.peril,
    c.loss_date,
    c.status,
    c.claim_amount        as incurred,
    c.paid_amount         as paid,
    c.reserve_amount      as case_reserve,
    c.fraud_flag,
    e.annual_premium,
    e.months_exposure,
    e.annual_premium * e.months_exposure / 12.0   as earned_premium
from {{ ref('stg_claims') }} c
left join policy_exposure e on c.policy_id = e.policy_id
