-- Pricing adequacy: actual loss ratio vs. the 68% target by product and region.
-- loss_ratio_adequacy_index > 1.0  →  under-priced segment (needs rate action)
{% set target_lr = var('target_loss_ratio') %}

select
    product,
    region,
    count(distinct claim_id)                                   as claims,
    sum(earned_premium)                                        as earned_premium,
    sum(incurred)                                              as incurred,
    round(sum(incurred) / nullif(sum(earned_premium), 0), 4)    as actual_loss_ratio,
    {{ target_lr }}                                            as target_loss_ratio,
    round(
        (sum(incurred) / nullif(sum(earned_premium), 0)) / {{ target_lr }},
        4)                                                     as adequacy_index,
    case
        when (sum(incurred) / nullif(sum(earned_premium), 0)) > {{ target_lr }} * 1.1
            then 'Increase'
        when (sum(incurred) / nullif(sum(earned_premium), 0)) < {{ target_lr }} * 0.85
            then 'Decrease'
        else 'Hold'
    end as rate_action
from {{ ref('fct_claims') }}
group by product, region
order by adequacy_index desc
