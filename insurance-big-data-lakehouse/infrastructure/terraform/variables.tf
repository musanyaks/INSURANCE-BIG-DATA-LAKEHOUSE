variable "project_name" {
  description = "Project prefix for all resources"
  type        = string
  default     = "meridian-lakehouse"
}

variable "environment" {
  description = "Environment label (dev | staging | prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "noncurrent_version_retention_days" {
  description = "Days to keep noncurrent object versions (time travel for Delta)"
  type        = number
  default     = 30
}
