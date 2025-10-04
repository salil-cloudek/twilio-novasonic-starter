variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "state_bucket_name" {
  description = "Name of the S3 bucket for storing Terraform state"
  type        = string
  default     = "twillio-nova-starter-dev"
}

variable "dynamodb_table_name" {
  description = "Name of the DynamoDB table for state locking"
  type        = string
  default     = "twillio-nova-starter-lock-dev"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "twillio-nova-starter"
}

variable "common_tags" {
  description = "Common tags to be applied to all resources"
  type        = map(string)
  default     = {}
}
