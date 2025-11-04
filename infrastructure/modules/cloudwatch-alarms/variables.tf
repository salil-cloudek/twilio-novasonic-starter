variable "service_name" {
  description = "Name of the service for alarm naming"
  type        = string
}

variable "ecs_service_name" {
  description = "Name of the ECS service"
  type        = string
}

variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
}

variable "target_group_arn_suffix" {
  description = "ARN suffix of the target group for ALB metrics"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "notification_emails" {
  description = "List of email addresses to receive alarm notifications"
  type        = list(string)
  default     = []
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications (optional)"
  type        = string
  default     = null
}

variable "memory_threshold_bytes" {
  description = "Memory usage threshold in bytes for custom memory alarm"
  type        = number
  default     = 3221225472 # 3GB in bytes (80% of 4GB container)
}

variable "error_count_threshold" {
  description = "Error count threshold for custom error alarm"
  type        = number
  default     = 10
}

variable "websocket_connection_threshold" {
  description = "WebSocket connection count threshold"
  type        = number
  default     = 1000
}

variable "websocket_connection_rate_threshold" {
  description = "WebSocket connection rate threshold (connections per 5 minutes)"
  type        = number
  default     = 100
}

variable "cloudwatch_log_group_name" {
  description = "Name of the CloudWatch log group for ECS tasks"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}