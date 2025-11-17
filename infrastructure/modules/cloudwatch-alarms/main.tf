# SNS Topic for CloudWatch Alarms
resource "aws_sns_topic" "cloudwatch_alarms" {
  name = "${var.service_name}-cloudwatch-alarms"

  tags = var.tags
}

# SNS Topic Policy
resource "aws_sns_topic_policy" "cloudwatch_alarms" {
  arn = aws_sns_topic.cloudwatch_alarms.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.cloudwatch_alarms.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# SNS Topic Subscriptions
resource "aws_sns_topic_subscription" "email_notifications" {
  count = length(var.notification_emails)

  topic_arn = aws_sns_topic.cloudwatch_alarms.arn
  protocol  = "email"
  endpoint  = var.notification_emails[count.index]
}

resource "aws_sns_topic_subscription" "slack_webhook" {
  count = var.slack_webhook_url != null ? 1 : 0

  topic_arn = aws_sns_topic.cloudwatch_alarms.arn
  protocol  = "https"
  endpoint  = var.slack_webhook_url
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# 1. High Memory Usage Alarm (>80% of container memory)
resource "aws_cloudwatch_metric_alarm" "high_memory_usage" {
  alarm_name          = "${var.service_name}-high-memory-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ECS container memory utilization"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions          = [aws_sns_topic.cloudwatch_alarms.arn]
  treat_missing_data  = "breaching"

  dimensions = {
    ServiceName = var.ecs_service_name
    ClusterName = var.ecs_cluster_name
  }

  tags = var.tags
}

# Custom Memory Usage Alarm (from application metrics)
resource "aws_cloudwatch_metric_alarm" "custom_memory_usage" {
  alarm_name          = "${var.service_name}-custom-memory-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "twilio_bridge_memory_usage_bytes"
  namespace           = "TwilioBedrockBridge"
  period              = "300"
  statistic           = "Average"
  threshold           = var.memory_threshold_bytes
  alarm_description   = "This metric monitors application heap memory usage"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions          = [aws_sns_topic.cloudwatch_alarms.arn]
  treat_missing_data  = "breaching"

  dimensions = {
    type = "heap_used"
  }

  tags = var.tags
}

# 2. High Error Rate Alarm (>5% of requests)
resource "aws_cloudwatch_metric_alarm" "high_error_rate" {
  alarm_name          = "${var.service_name}-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  threshold           = "5"
  alarm_description   = "This metric monitors HTTP 5xx error rate"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions          = [aws_sns_topic.cloudwatch_alarms.arn]
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "error_rate"
    return_data = true

    metric {
      metric_name = "HTTPCode_Target_5XX_Count"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"

      dimensions = {
        TargetGroup = var.target_group_arn_suffix
      }
    }
  }

  metric_query {
    id          = "total_requests"
    return_data = false

    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = 300
      stat        = "Sum"

      dimensions = {
        TargetGroup = var.target_group_arn_suffix
      }
    }
  }

  metric_query {
    id          = "error_percentage"
    return_data = false
    expression  = "(error_rate / total_requests) * 100"
  }

  tags = var.tags
}

# Custom Application Error Rate Alarm
resource "aws_cloudwatch_metric_alarm" "custom_error_rate" {
  alarm_name          = "${var.service_name}-custom-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "twilio_bridge_errors_total"
  namespace           = "TwilioBedrockBridge"
  period              = "300"
  statistic           = "Sum"
  threshold           = var.error_count_threshold
  alarm_description   = "This metric monitors application error count"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions          = [aws_sns_topic.cloudwatch_alarms.arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# 3. Event Loop Lag Alarm (>100ms)
resource "aws_cloudwatch_metric_alarm" "high_event_loop_lag" {
  alarm_name          = "${var.service_name}-high-event-loop-lag"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "twilio_bridge_event_loop_lag_seconds"
  namespace           = "TwilioBedrockBridge"
  period              = "300"
  statistic           = "Average"
  threshold           = "0.1" # 100ms in seconds
  alarm_description   = "This metric monitors Node.js event loop lag"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions          = [aws_sns_topic.cloudwatch_alarms.arn]
  treat_missing_data  = "breaching"

  tags = var.tags
}

# 4. Stale Sessions Alarm (>10 sessions older than 30min)
resource "aws_cloudwatch_metric_alarm" "stale_sessions" {
  alarm_name          = "${var.service_name}-stale-sessions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "twilio_bridge_stale_sessions_count"
  namespace           = "TwilioBedrockBridge"
  period              = "300"
  statistic           = "Maximum"
  threshold           = "10"
  alarm_description   = "This metric monitors stale WebSocket sessions older than 30 minutes"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions          = [aws_sns_topic.cloudwatch_alarms.arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# 5. WebSocket Connection Spike Alarm
resource "aws_cloudwatch_metric_alarm" "websocket_connection_spike" {
  alarm_name          = "${var.service_name}-websocket-connection-spike"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "twilio_bridge_websocket_connections_active"
  namespace           = "TwilioBedrockBridge"
  period              = "300"
  statistic           = "Maximum"
  threshold           = var.websocket_connection_threshold
  alarm_description   = "This metric monitors WebSocket connection spikes"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions          = [aws_sns_topic.cloudwatch_alarms.arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# WebSocket Connection Rate of Change Alarm
resource "aws_cloudwatch_metric_alarm" "websocket_connection_rate_spike" {
  alarm_name          = "${var.service_name}-websocket-connection-rate-spike"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  threshold           = var.websocket_connection_rate_threshold
  alarm_description   = "This metric monitors rapid increases in WebSocket connections"
  alarm_actions       = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions          = [aws_sns_topic.cloudwatch_alarms.arn]
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "connection_rate"
    return_data = true

    metric {
      metric_name = "twilio_bridge_websocket_connections_total"
      namespace   = "TwilioBedrockBridge"
      period      = 300
      stat        = "Sum"
    }
  }

  tags = var.tags
}

# Composite Alarm for Critical System Health
resource "aws_cloudwatch_composite_alarm" "system_health_critical" {
  alarm_name        = "${var.service_name}-system-health-critical"
  alarm_description = "Composite alarm for critical system health issues"

  alarm_rule = join(" OR ", [
    "ALARM(${aws_cloudwatch_metric_alarm.high_memory_usage.alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.high_error_rate.alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.high_event_loop_lag.alarm_name})"
  ])

  actions_enabled = true
  alarm_actions   = [aws_sns_topic.cloudwatch_alarms.arn]
  ok_actions      = [aws_sns_topic.cloudwatch_alarms.arn]

  tags = var.tags
}

# Enhanced Dashboard for comprehensive monitoring
resource "aws_cloudwatch_dashboard" "monitoring_dashboard" {
  dashboard_name = "${var.service_name}-monitoring"

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: System Health Overview
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 6
        height = 6

        properties = {
          metrics = [
            ["AWS/ECS", "MemoryUtilization", "ServiceName", var.ecs_service_name, "ClusterName", var.ecs_cluster_name, { "label" = "ECS Memory %" }],
            ["TwilioBedrockBridge", "twilio_bridge_memory_usage_bytes", "type", "heap_used", { "label" = "Heap Used", "yAxis" = "right" }],
            [".", ".", "type", "heap_total", { "label" = "Heap Total", "yAxis" = "right" }],
            [".", ".", "type", "rss", { "label" = "RSS", "yAxis" = "right" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Memory Utilization"
          period  = 300
          yAxis = {
            left = {
              min = 0
              max = 100
            }
            right = {
              min = 0
            }
          }
          annotations = {
            horizontal = [
              {
                label = "Memory Alarm Threshold"
                value = 80
              }
            ]
          }
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 0
        width  = 6
        height = 6

        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", var.ecs_service_name, "ClusterName", var.ecs_cluster_name, { "label" = "ECS CPU %" }],
            ["TwilioBedrockBridge", "twilio_bridge_event_loop_lag_seconds", { "label" = "Event Loop Lag (s)", "yAxis" = "right" }],
            [".", "twilio_bridge_active_handles", { "label" = "Active Handles", "yAxis" = "right" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "CPU & Event Loop Performance"
          period  = 300
          yAxis = {
            left = {
              min = 0
              max = 100
            }
            right = {
              min = 0
            }
          }
          annotations = {
            horizontal = [
              {
                label = "Event Loop Lag Threshold"
                value = 0.1
                yAxis = "right"
              }
            ]
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 6
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_websocket_connections_active", { "label" = "Active Connections" }],
            [".", "twilio_bridge_stale_sessions_count", { "label" = "Stale Sessions" }],
            [".", "twilio_bridge_calls_active", { "label" = "Active Calls" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Active Sessions & Connections"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
          annotations = {
            horizontal = [
              {
                label = "Stale Sessions Threshold"
                value = 10
              },
              {
                label = "Connection Spike Threshold"
                value = var.websocket_connection_threshold
              }
            ]
          }
        }
      },
      {
        type   = "metric"
        x      = 18
        y      = 0
        width  = 6
        height = 6

        properties = {
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", var.target_group_arn_suffix, { "label" = "Healthy Hosts" }],
            [".", "UnHealthyHostCount", ".", ".", { "label" = "Unhealthy Hosts" }],
            [".", "TargetResponseTime", ".", ".", { "label" = "Response Time (s)", "yAxis" = "right" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Load Balancer Health"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
            right = {
              min = 0
            }
          }
        }
      },

      # Row 2: Traffic and Error Metrics
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "TargetGroup", var.target_group_arn_suffix, { "stat" = "Sum", "label" = "Total Requests" }],
            [".", "HTTPCode_Target_2XX_Count", ".", ".", { "stat" = "Sum", "label" = "2XX Responses" }],
            [".", "HTTPCode_Target_4XX_Count", ".", ".", { "stat" = "Sum", "label" = "4XX Responses" }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { "stat" = "Sum", "label" = "5XX Responses" }]
          ]
          view    = "timeSeries"
          stacked = true
          region  = var.region
          title   = "HTTP Request Volume & Status Codes"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 6
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_errors_total", "error_type", "websocket_error", { "label" = "WebSocket Errors" }],
            [".", ".", "error_type", "bedrock_api_error", { "label" = "Bedrock API Errors" }],
            [".", ".", "error_type", "audio_processing_error", { "label" = "Audio Processing Errors" }],
            [".", ".", "error_type", "validation_error", { "label" = "Validation Errors" }]
          ]
          view    = "timeSeries"
          stacked = true
          region  = var.region
          title   = "Application Errors by Type"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 6
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_websocket_connections_total", { "stat" = "Sum", "label" = "New Connections" }],
            [".", "twilio_bridge_websocket_messages_total", "direction", "inbound", { "stat" = "Sum", "label" = "Inbound Messages" }],
            [".", ".", "direction", "outbound", { "stat" = "Sum", "label" = "Outbound Messages" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "WebSocket Activity"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },

      # Row 3: Performance and Latency
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_response_latency_seconds", "stage", "end_to_end", { "stat" = "Average", "label" = "Avg Response Time" }],
            [".", ".", ".", ".", { "stat" = "p95", "label" = "P95 Response Time" }],
            [".", ".", ".", ".", { "stat" = "p99", "label" = "P99 Response Time" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "End-to-End Response Latency"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 12
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_bedrock_request_duration_seconds", { "stat" = "Average", "label" = "Avg Bedrock Latency" }],
            [".", ".", { "stat" = "p95", "label" = "P95 Bedrock Latency" }],
            [".", "twilio_bridge_bedrock_streaming_latency_seconds", { "stat" = "Average", "label" = "First Token Latency" }],
            [".", "twilio_bridge_bedrock_requests_total", { "stat" = "Sum", "yAxis" = "right", "label" = "Bedrock Requests" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Bedrock API Performance"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
            right = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 12
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_bedrock_tokens_input_total", { "stat" = "Sum", "label" = "Input Tokens" }],
            [".", "twilio_bridge_bedrock_tokens_output_total", { "stat" = "Sum", "label" = "Output Tokens" }],
            [".", "twilio_bridge_conversation_turns_total", { "stat" = "Sum", "yAxis" = "right", "label" = "Conversation Turns" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Token Usage & Conversations"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
            right = {
              min = 0
            }
          }
        }
      },

      # Row 4: Audio Processing
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_audio_chunks_processed_total", "operation", "receive", { "stat" = "Sum", "label" = "Audio Chunks Received" }],
            [".", ".", "operation", "send", { "stat" = "Sum", "label" = "Audio Chunks Sent" }],
            [".", "twilio_bridge_audio_processing_duration_seconds", { "stat" = "Average", "yAxis" = "right", "label" = "Processing Time (s)" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Audio Processing Volume"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
            right = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 18
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_audio_chunk_size_bytes", { "stat" = "Average", "label" = "Avg Chunk Size" }],
            [".", ".", { "stat" = "p95", "label" = "P95 Chunk Size" }],
            [".", "twilio_bridge_websocket_message_size_bytes", "direction", "inbound", { "stat" = "Average", "label" = "Avg Inbound Message Size" }],
            [".", ".", "direction", "outbound", { "stat" = "Average", "label" = "Avg Outbound Message Size" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Message & Chunk Sizes"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 18
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_calls_total", { "stat" = "Sum", "label" = "Total Calls" }],
            [".", "twilio_bridge_call_duration_seconds", { "stat" = "Average", "label" = "Avg Call Duration" }],
            [".", "twilio_bridge_websocket_connection_duration_seconds", { "stat" = "Average", "label" = "Avg Connection Duration" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Call & Connection Duration"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },

      # Row 5: Summary Numbers
      {
        type   = "metric"
        x      = 0
        y      = 24
        width  = 6
        height = 3

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_websocket_connections_active"]
          ]
          view   = "singleValue"
          region = var.region
          title  = "Active WebSocket Connections"
          period = 300
          stat   = "Maximum"
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 24
        width  = 6
        height = 3

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_stale_sessions_count"]
          ]
          view   = "singleValue"
          region = var.region
          title  = "Stale Sessions"
          period = 300
          stat   = "Maximum"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 24
        width  = 6
        height = 3

        properties = {
          metrics = [
            ["AWS/ECS", "MemoryUtilization", "ServiceName", var.ecs_service_name, "ClusterName", var.ecs_cluster_name]
          ]
          view   = "singleValue"
          region = var.region
          title  = "Memory Utilization %"
          period = 300
          stat   = "Average"
        }
      },
      {
        type   = "metric"
        x      = 18
        y      = 24
        width  = 6
        height = 3

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_event_loop_lag_seconds"]
          ]
          view   = "singleValue"
          region = var.region
          title  = "Event Loop Lag (ms)"
          period = 300
          stat   = "Average"
        }
      },

      # Row 6: Alarm Status
      {
        type   = "metric"
        x      = 0
        y      = 27
        width  = 24
        height = 3

        properties = {
          metrics = [
            ["AWS/CloudWatch", "MetricCount", { "label" = "Alarm Status" }]
          ]
          view   = "singleValue"
          region = var.region
          title  = "Alarm Status Overview"
          period = 300
          stat   = "Sum"
        }
      }
    ]
    period_override = "inherit"
    start           = "-PT3H"
    end             = "PT0H"
  })
}

# Operational Insights Dashboard - focused on troubleshooting and capacity planning
resource "aws_cloudwatch_dashboard" "operational_insights" {
  dashboard_name = "${var.service_name}-operational-insights"

  dashboard_body = jsonencode({
    widgets = [
      # Error Analysis
      {
        type   = "log"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          query  = "SOURCE '${var.cloudwatch_log_group_name}'\n| fields @timestamp, @message\n| filter @message like /ERROR/\n| sort @timestamp desc\n| limit 100"
          region = var.region
          title  = "Recent Error Logs"
          view   = "table"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_errors_total", "component", "websocket", { "label" = "WebSocket Component" }],
            [".", ".", "component", "bedrock", { "label" = "Bedrock Component" }],
            [".", ".", "component", "audio", { "label" = "Audio Component" }],
            [".", ".", "component", "twilio", { "label" = "Twilio Component" }]
          ]
          view    = "timeSeries"
          stacked = true
          region  = var.region
          title   = "Errors by Component"
          period  = 300
          stat    = "Sum"
        }
      },

      # Performance Deep Dive
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_gc_duration_seconds", "gc_type", "major", { "label" = "Major GC" }],
            [".", ".", "gc_type", "minor", { "label" = "Minor GC" }],
            [".", ".", "gc_type", "incremental", { "label" = "Incremental GC" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Garbage Collection Performance"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 6
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_bedrock_request_duration_seconds", "operation", "invoke_model", { "stat" = "Average", "label" = "Invoke Model Avg" }],
            [".", ".", "operation", "invoke_model_stream", { "stat" = "Average", "label" = "Streaming Avg" }],
            [".", ".", "operation", "invoke_model", { "stat" = "p99", "label" = "Invoke Model P99" }],
            [".", ".", "operation", "invoke_model_stream", { "stat" = "p99", "label" = "Streaming P99" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Bedrock Operation Latency Distribution"
          period  = 300
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 6
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_audio_sample_rate_hz", { "stat" = "Average", "label" = "Sample Rate" }],
            [".", "twilio_bridge_websocket_message_size_bytes", "message_type", "media", { "stat" = "Average", "yAxis" = "right", "label" = "Media Message Size" }],
            [".", ".", "message_type", "start", { "stat" = "Average", "yAxis" = "right", "label" = "Start Message Size" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Audio Quality Metrics"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
            right = {
              min = 0
            }
          }
        }
      },

      # Capacity Planning
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_websocket_connections_active", { "stat" = "Maximum", "label" = "Peak Connections" }],
            [".", ".", { "stat" = "Average", "label" = "Avg Connections" }],
            [".", "twilio_bridge_calls_active", { "stat" = "Maximum", "label" = "Peak Calls" }],
            [".", ".", { "stat" = "Average", "label" = "Avg Calls" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Connection & Call Volume Trends"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ECS", "MemoryUtilization", "ServiceName", var.ecs_service_name, "ClusterName", var.ecs_cluster_name, { "stat" = "Maximum", "label" = "Peak Memory %" }],
            [".", "CPUUtilization", ".", ".", ".", ".", { "stat" = "Maximum", "label" = "Peak CPU %" }],
            [".", "MemoryUtilization", ".", ".", ".", ".", { "stat" = "Average", "label" = "Avg Memory %" }],
            [".", "CPUUtilization", ".", ".", ".", ".", { "stat" = "Average", "label" = "Avg CPU %" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Resource Utilization Trends"
          period  = 300
          yAxis = {
            left = {
              min = 0
              max = 100
            }
          }
        }
      },

      # Business Metrics
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_conversation_turns_total", { "stat" = "Sum", "label" = "Total Turns" }],
            [".", "twilio_bridge_calls_total", { "stat" = "Sum", "label" = "Total Calls" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Business Volume Metrics"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 18
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_call_duration_seconds", { "stat" = "Average", "label" = "Avg Call Duration" }],
            [".", ".", { "stat" = "p50", "label" = "Median Call Duration" }],
            [".", ".", { "stat" = "p95", "label" = "P95 Call Duration" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Call Duration Distribution"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 18
        width  = 8
        height = 6

        properties = {
          metrics = [
            ["TwilioBedrockBridge", "twilio_bridge_bedrock_tokens_input_total", { "stat" = "Sum", "label" = "Input Tokens/Period" }],
            [".", "twilio_bridge_bedrock_tokens_output_total", { "stat" = "Sum", "label" = "Output Tokens/Period" }]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.region
          title   = "Token Consumption Rate"
          period  = 300
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      }
    ]
    period_override = "inherit"
    start           = "-PT6H"
    end             = "PT0H"
  })
}