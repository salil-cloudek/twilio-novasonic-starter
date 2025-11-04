# CloudWatch Alarms for Production Environment
module "cloudwatch_alarms" {
  source = "../../modules/cloudwatch-alarms"

  # Service identification
  service_name              = local.service_name
  ecs_service_name          = module.ecs.ecs_service_name
  ecs_cluster_name          = module.ecs.ecs_cluster_name
  target_group_arn_suffix   = module.alb.target_group_arn_suffix
  cloudwatch_log_group_name = module.ecs.cloudwatch_log_group_name
  region                    = var.region

  # Notification settings
  notification_emails = var.notification_emails
  slack_webhook_url   = var.slack_webhook_url

  # Alarm thresholds (production-grade values - more sensitive)
  memory_threshold_bytes              = 2684354560 # 2.5GB (62.5% of 4GB container - lower threshold)
  error_count_threshold               = 3          # 3 errors in 5 minutes (very sensitive)
  websocket_connection_threshold      = 2000       # 2000 concurrent connections
  websocket_connection_rate_threshold = 200        # 200 new connections per 5 minutes

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