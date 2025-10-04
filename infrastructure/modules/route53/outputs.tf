output "hosted_zone_id" {
  description = "The hosted zone ID"
  value       = aws_route53_zone.main.zone_id
}

output "hosted_zone_name" {
  description = "The hosted zone name"
  value       = aws_route53_zone.main.name
}

output "name_servers" {
  description = "A list of name servers in associated (or default) delegation set"
  value       = aws_route53_zone.main.name_servers
}

output "domain_name" {
  description = "The domain name (FQDN) for the A record"
  value       = aws_route53_record.alb.name
}

output "fqdn" {
  description = "The fully qualified domain name"
  value       = aws_route53_record.alb.fqdn
}
