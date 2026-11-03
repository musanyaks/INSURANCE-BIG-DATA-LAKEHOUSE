-- Singular test: no loss ratio should be absurd (data-quality guard for marts)
select *
from {{ ref('mart_loss_ratio_by_region') }}
where loss_ratio is null
   or loss_ratio < 0
   or loss_ratio > 3.0
