output "lakehouse_bucket" {
  description = "S3 bucket holding the medallion layers"
  value       = aws_s3_bucket.lakehouse.id
}

output "lakehouse_bucket_arn" {
  value = aws_s3_bucket.lakehouse.arn
}

output "spark_jobs_role_arn" {
  description = "IAM role for Spark/streaming workloads"
  value       = aws_iam_role.spark_jobs.arn
}

output "s3a_root" {
  description = "LAKEHOUSE_ROOT value for the application stack"
  value       = "s3a://${aws_s3_bucket.lakehouse.id}"
}
