-- Conformed premium payment transactions
select
    payment_id,
    policy_id,
    due_date,
    amount,
    status,
    method,
    date_format(due_date, '%Y-%m') as due_month
from {{ source('lakehouse_silver', 'payments') }}
where amount > 0
