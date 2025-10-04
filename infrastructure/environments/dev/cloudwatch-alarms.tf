# CloudWatch Alarms for Development Environment
module "cloudwatch_alarms" {
  source = "../../modules/cloudwatch-alarms"

  # Service identification
  service_name       = local.service_name
  ecs_service_name   = module.ecs.ecs_service_name
  ecs_cluster_name   = module.ecs.ecs_cluster_name
  target_group_arn_suffix = module.alb.target_group_arn_suffix
  cloudwatch_log_group_name = module.ecs.cloudwatch_log_group_name
  region             = var.region

  # Notification settings
  notification_emails = var.notification_emails
  slack_webhook_url   = var.slack_webhook_url

  # Alarm thresholds (customize per environment)
  memory_threshold_bytes              = 3221225472  # 3GB (80% of 4GB container)
  error_count_threshold              = 5            # 5 errors in 5 minutes
  websocket_connection_threshold     = 500          # 500 concurrent connections
  websocket_connection_rate_threshold = 50          # 50 new connections per 5 minutes

  tags = local.tags
}

# Output alarm information for reference
output "cloudwatch_alarms" {
  description = "CloudWatch alarm information"
  value = {
    sns_topic_arn             = module.cloudwatch_alarms.sns_topic_arn
    main_dashboard_url        = module.cloudwatch_alarms.dashboard_url
    operational_dashboard_url = module.cloudwatch_alarms.operational_dashboard_url
    dashboard_names           = module.cloudwatch_alarms.dashboard_names
    alarm_names               = module.cloudwatch_alarms.alarm_names
  }
}