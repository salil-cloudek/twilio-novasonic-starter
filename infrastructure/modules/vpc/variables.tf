variable "vpc_name" {
  description = "Name for the VPC"
  type        = string
}

variable "vpc_cidr_block" {
  description = "IP Subnet"
  type        = string
  default     = "10.0.0.0/16"
}

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
  description = "Region to deploy VPC into"
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Tags to apply to all VPC resources"
  type        = map(string)
  default     = {}
}
