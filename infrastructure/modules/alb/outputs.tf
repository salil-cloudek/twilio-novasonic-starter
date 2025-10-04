output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.main.zone_id
}

output "target_group_arn" {
  description = "ARN of the target group"
  value       = aws_lb_target_group.ecs_service.arn
}

output "target_group_arn_suffix" {
  description = "ARN suffix of the target group (for CloudWatch metrics)"
  value       = aws_lb_target_group.ecs_service.arn_suffix
}

output "alb_security_group_id" {
  description = "Security group ID of the ALB"
  value       = aws_security_group.alb.id
}

output "alb_url" {
  description = "URL of the Application Load Balancer"
  value       = "http://${aws_lb.main.dns_name}"
}

output "alb_https_url" {
  description = "HTTPS URL of the Application Load Balancer"
  value       = var.domain_name != null ? "https://${var.domain_name}" : "https://${aws_lb.main.dns_name}"
}

output "certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = var.domain_name != null ? aws_acm_certificate.main[0].arn : null
}

output "certificate_domain_validation_options" {
  description = "Domain validation options for the certificate"
  value       = var.domain_name != null ? aws_acm_certificate.main[0].domain_validation_options : null
}

output "websocket_url" {
  description = "WebSocket URL for Twilio Media Streams (HTTP)"
  value       = "ws://${aws_lb.main.dns_name}/media"
}

output "websocket_secure_url" {
  description = "Secure WebSocket URL for Twilio Media Streams (HTTPS)"
  value       = var.domain_name != null ? "wss://${var.domain_name}/media" : "wss://${aws_lb.main.dns_name}/media"
}
