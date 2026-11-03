# ─────────────────────────────────────────────────────────────────────────────
# Lakehouse object store: one versioned, encrypted S3 bucket for all medallion
# layers (bronze/ silver/ gold/ landing/) + an IAM role for Spark jobs.
# MSK (managed Kafka) and EMR are intentionally not provisioned here — the
# demo runs single-node; wire them in for production scale.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "lakehouse" {
  bucket = "${var.project_name}-${var.environment}"
}

resource "aws_s3_bucket_versioning" "lakehouse" {
  bucket = aws_s3_bucket.lakehouse.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lakehouse" {
  bucket = aws_s3_bucket.lakehouse.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "lakehouse" {
  bucket                  = aws_s3_bucket.lakehouse.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "lakehouse" {
  bucket = aws_s3_bucket.lakehouse.id

  rule {
    id     = "noncurrent-cleanup"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }
  }

  rule {
    id     = "landing-tiering"
    status = "Enabled"

    filter {
      prefix = "landing/"
    }

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
  }
}

# ── IAM: role assumed by Spark / streaming workloads ────────────────────────
data "aws_iam_policy_document" "spark_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com", "emr.amazonaws.com", "eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "spark_jobs" {
  name               = "${var.project_name}-spark-jobs"
  assume_role_policy = data.aws_iam_policy_document.spark_assume.json
}

data "aws_iam_policy_document" "lakehouse_rw" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.lakehouse.arn, "${aws_s3_bucket.lakehouse.arn}/*"]
  }

  statement {
    actions   = ["kafka:*"]
    resources = ["*"] # tighten to the MSK cluster ARN when MSK is provisioned
  }
}

resource "aws_iam_role_policy" "lakehouse_rw" {
  name   = "lakehouse-read-write"
  role   = aws_iam_role.spark_jobs.id
  policy = data.aws_iam_policy_document.lakehouse_rw.json
}
