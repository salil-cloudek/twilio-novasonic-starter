output "sns_topic_arn" {
  description = "ARN of the SNS topic for CloudWatch alarms"
  value       = aws_sns_topic.cloudwatch_alarms.arn
}

output "sns_topic_name" {
  description = "Name of the SNS topic for CloudWatch alarms"
  value       = aws_sns_topic.cloudwatch_alarms.name
}

output "dashboard_url" {
  description = "URL of the main CloudWatch dashboard"
  value       = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${aws_cloudwatch_dashboard.monitoring_dashboard.dashboard_name}"
}

output "operational_dashboard_url" {
  description = "URL of the operational insights CloudWatch dashboard"
  value       = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${aws_cloudwatch_dashboard.operational_insights.dashboard_name}"
}

output "dashboard_names" {
  description = "Names of all created CloudWatch dashboards"
  value = {
    main_dashboard        = aws_cloudwatch_dashboard.monitoring_dashboard.dashboard_name
    operational_dashboard = aws_cloudwatch_dashboard.operational_insights.dashboard_name
  }
}

output "alarm_names" {
  description = "Names of all created CloudWatch alarms"
  value = {
    high_memory_usage               = aws_cloudwatch_metric_alarm.high_memory_usage.alarm_name
    custom_memory_usage             = aws_cloudwatch_metric_alarm.custom_memory_usage.alarm_name
    high_error_rate                 = aws_cloudwatch_metric_alarm.high_error_rate.alarm_name
    custom_error_rate               = aws_cloudwatch_metric_alarm.custom_error_rate.alarm_name
    high_event_loop_lag             = aws_cloudwatch_metric_alarm.high_event_loop_lag.alarm_name
    stale_sessions                  = aws_cloudwatch_metric_alarm.stale_sessions.alarm_name
    websocket_connection_spike      = aws_cloudwatch_metric_alarm.websocket_connection_spike.alarm_name
    websocket_connection_rate_spike = aws_cloudwatch_metric_alarm.websocket_connection_rate_spike.alarm_name
    system_health_critical          = aws_cloudwatch_composite_alarm.system_health_critical.alarm_name
  }
}