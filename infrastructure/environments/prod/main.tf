terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# Define common tags and locals for all resources
locals {
  service_name = "twilio-media-stream-service"
  common_tags = merge(var.common_tags, {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "opentofu"
  })
  tags = local.common_tags
}

# Creating a new VPC just for this workload, you may not want to do this
module "vpc" {
  source = "../../modules/vpc"

  vpc_name        = var.vpc_name
  vpc_cidr_block  = var.vpc_cidr_block
  azs             = var.azs
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets
  region          = var.region
  tags            = local.common_tags
}

# ECR Repository for container images
module "ecr" {
  source = "../../modules/ecr"

  repository_name      = var.ecr_repository_name
  image_tag_mutability = var.ecr_image_tag_mutability
  scan_on_push         = var.ecr_scan_on_push
  encryption_type      = var.ecr_encryption_type
  lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 50 production images"
        selection = {
          tagStatus      = "tagged"
          tagPrefixList  = ["v"]
          countType      = "imageCountMoreThan"
          countNumber    = 50
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep production releases for 1 year"
        selection = {
          tagStatus      = "tagged"
          tagPrefixList  = ["prod-", "release-"]
          countType      = "sinceImagePushed"
          countUnit      = "days"
          countNumber    = 365
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 3
        description  = "Delete untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
  force_delete         = var.ecr_force_delete
  tags                 = local.common_tags
}

# Application Load Balancer
module "alb" {
  source = "../../modules/alb"

  alb_name                   = "${var.project_name}-${var.environment}-alb"
  vpc_id                     = module.vpc.vpc_id
  public_subnet_ids          = module.vpc.public_subnets
  target_port                = 8080
  health_check_path          = "/health/liveness"
  enable_deletion_protection = true  # Enable deletion protection for production
  
  # SSL Certificate configuration using existing hosted zone
  domain_name                = var.domain_name
  subject_alternative_names  = var.subject_alternative_names
  hosted_zone_id            = var.hosted_zone_id
  
  tags                       = local.common_tags

  depends_on = [
    module.vpc
  ]
}

# DNS A record pointing to ALB (create the subdomain)
resource "aws_route53_record" "alb_alias" {
  count   = var.domain_name != null && var.hosted_zone_id != null ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [module.alb]
}

# ECS Cluster and Service
module "ecs" {
  source = "../../modules/ecs"

  ecs_cluster_name              = var.ecs_cluster_name
  ecr_repository_url            = module.ecr.repository_url
  region                        = var.region
  service_name                  = local.service_name
  desired_count                 = 3  # Higher count for production availability
  subnet_ids                    = module.vpc.private_subnets
  assign_public_ip              = false
  vpc_id                        = module.vpc.vpc_id
  target_group_arn              = module.alb.target_group_arn
  alb_security_group_id         = module.alb.alb_security_group_id
  
  # Domain configuration
  domain_name                   = var.domain_name
  
  # Logging configuration
  log_level                     = var.log_level
  enable_debug_logging          = var.enable_debug_logging
  enable_nova_debug_logging     = var.enable_nova_debug_logging
  cloudwatch_log_retention_days = var.cloudwatch_log_retention_days
  
  # Twilio configuration
  twilio_auth_token             = var.twilio_auth_token
  verify_twilio_signature       = var.verify_twilio_signature
  
  tags = local.common_tags

  depends_on = [
    module.ecr,
    module.vpc,
    module.alb
  ]
}