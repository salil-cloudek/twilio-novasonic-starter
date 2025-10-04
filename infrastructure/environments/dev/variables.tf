variable "public_subnets" {
  description = "Public subnet names to use"
  type        = list(string)
}

variable "private_subnets" {
  description = "Private subnet names to use"
  type        = list(string)
}

variable "azs" {
  description = "Availability Zones to use"
  type        = list(string)
}

variable "region" {
  description = "Region to deploy into"
  type        = string
}

variable "vpc_name" {
  description = "What to call the VPC"
  type        = string
}

variable "vpc_cidr_block" {
  description = "CIDR block for the VPC"
  type        = string
}

variable "ecs_cluster_name" {
  description = "Name of ECS Cluster"
  type        = string
  default     = "amazon-nova-dev-cluster"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "amazon-nova-starter"
}

variable "common_tags" {
  description = "Common tags to be applied to all resources"
  type        = map(string)
  default     = {}
}

# ECR Variables
variable "ecr_repository_name" {
  description = "Name of the ECR repository"
  type        = string
  default     = "twilio-novasonic-starter"
}

variable "ecr_image_tag_mutability" {
  description = "The tag mutability setting for the repository. Must be one of: MUTABLE or IMMUTABLE"
  type        = string
  default     = "MUTABLE"
}

variable "ecr_scan_on_push" {
  description = "Indicates whether images are scanned after being pushed to the repository"
  type        = bool
  default     = true
}

variable "ecr_encryption_type" {
  description = "The encryption type to use for the repository. Valid values are AES256 or KMS"
  type        = string
  default     = "AES256"
}


variable "ecr_force_delete" {
  description = "If true, will delete the repository even if it contains images. Use with caution."
  type        = bool
  default     = true
}

# SSL Certificate Variables
variable "domain_name" {
  description = "Domain name for the SSL certificate (required)"
  type        = string
  # No default - must be provided
}

variable "subject_alternative_names" {
  description = "Subject alternative names for the SSL certificate"
  type        = list(string)
  default     = []
}

variable "hosted_zone_id" {
  description = "Route53 hosted zone ID for certificate validation (required when using custom domain)"
  type        = string
  # No default - must be provided when using custom domain
}

# Logging Configuration Variables
variable "log_level" {
  description = "Log level for the application (debug, info, warn, error)"
  type        = string
  default     = "debug"
}

variable "enable_debug_logging" {
  description = "Enable debug logging"
  type        = bool
  default     = false
}

variable "enable_nova_debug_logging" {
  description = "Enable Nova Sonic debug logging"
  type        = bool
  default     = false
}

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

# Twilio Configuration Variables
variable "twilio_auth_token" {
  description = "Twilio Auth Token for webhook signature verification"
  type        = string
  sensitive   = true
  default     = null
}

variable "verify_twilio_signature" {
  description = "Enable/disable Twilio signature verification"
  type        = bool
  default     = true
}

# CloudWatch Alarms Notification Variables
variable "notification_emails" {
  description = "List of email addresses to receive CloudWatch alarm notifications"
  type        = list(string)
  default     = []
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for CloudWatch alarm notifications (optional)"
  type        = string
  default     = null
  sensitive   = true
}
