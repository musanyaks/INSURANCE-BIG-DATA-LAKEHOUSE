terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Recommended: keep state in S3 + DynamoDB locking
  # backend "s3" {
  #   bucket         = "meridian-tfstate"
  #   key            = "lakehouse/terraform.tfstate"
  #   region         = "eu-west-1"
  #   dynamodb_table = "meridian-tf-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
