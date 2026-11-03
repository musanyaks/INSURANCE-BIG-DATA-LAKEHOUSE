# Terraform — Lakehouse Foundation

Provisions the cloud substrate for the lakehouse on AWS:

* **S3 bucket** — versioned, SSE-encrypted, public-access blocked; lifecycle
  rules tier the `landing/` prefix to STANDARD_IA and expire noncurrent
  versions (Delta time-travel safety window).
* **IAM role** `meridian-lakehouse-spark-jobs` — read/write on the bucket,
  Kafka access for streaming workloads.

MSK / EMR / EKS provisioning is intentionally left out (the demo is
single-node); add them as separate modules when scaling up.

## Usage

```bash
cd infrastructure/terraform
terraform init
terraform plan  -var environment=dev
terraform apply -var environment=dev
```

Then point the application stack at the bucket:

```bash
export LAKEHOUSE_ROOT=$(terraform output -raw s3a_root)
```
