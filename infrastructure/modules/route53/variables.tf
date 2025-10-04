variable "domain_name" {
  description = "The domain name for the hosted zone"
  type        = string
}

variable "subdomain" {
  description = "Optional subdomain (e.g., 'api' for api.example.com)"
  type        = string
  default     = null
}

variable "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  type        = string
}

variable "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  type        = string
}

variable "tags" {
  description = "A map of tags to assign to the resource"
  type        = map(string)
  default     = {}
}
