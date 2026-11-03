{% snapshot scd_customers %}

{{
    config(
      target_schema='analytics',
      unique_key='customer_id',
      strategy='check',
      check_cols=['credit_band', 'region', 'age'],
      invalidate_hard_deletes=True
    )
}}

select
    customer_id,
    name,
    age,
    region,
    credit_band,
    customer_since
from {{ source('lakehouse_silver', 'customers') }}

{% endsnapshot %}
