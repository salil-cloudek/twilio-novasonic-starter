# Environment Configurations

This directory contains OpenTofu/Terraform configurations for different deployment environments. Each environment is configured with appropriate settings for its intended use case.

## Environment Overview

| Environment | Purpose | Instance Count | Log Level | Monitoring | Security |
|-------------|---------|----------------|-----------|------------|----------|
| **dev** | Development & Testing | 1 | debug | Basic | Relaxed |
| **staging** | Integration Testing | 2 | info | Enhanced | Moderate |
| **prod** | Production | 3 | warn | Comprehensive | Strict |

## Environment Details

### Development (`dev/`)
- **Purpose**: Local development and feature testing
- **Instance Count**: 1 (minimal resources)
- **Logging**: Debug level with detailed Nova Sonic logging
- **Log Retention**: 3 days
- **ECR**: Force delete enabled, keeps 10 images
- **Monitoring**: Basic CloudWatch alarms
- **Security**: Relaxed settings for development ease

### Staging (`staging/`)
- **Purpose**: Integration testing and pre-production validation
- **Instance Count**: 2 (moderate availability)
- **Logging**: Info level, debug disabled
- **Log Retention**: 14 days
- **ECR**: Force delete disabled, keeps 20 images
- **Monitoring**: Enhanced monitoring with higher thresholds
- **Security**: Moderate security settings

### Production (`prod/`)
- **Purpose**: Live production workloads
- **Instance Count**: 3 (high availability across 3 AZs)
- **Logging**: Warn level only, no debug logging
- **Log Retention**: 90 days (compliance)
- **ECR**: Immutable tags, KMS encryption, keeps 50 images + 1 year retention
- **Monitoring**: Comprehensive monitoring with sensitive thresholds
- **Security**: Strict security settings, deletion protection enabled

## Key Configuration Differences

### Network Configuration
- **Dev**: `10.0.0.0/16` CIDR, 2 AZs
- **Staging**: `10.1.0.0/16` CIDR, 3 AZs
- **Production**: `10.2.0.0/16` CIDR, 3 AZs

### Security Settings
- **ECR Image Mutability**: 
  - Dev/Staging: `MUTABLE`
  - Production: `IMMUTABLE`
- **ECR Encryption**:
  - Dev/Staging: `AES256`
  - Production: `KMS`
- **ALB Deletion Protection**:
  - Dev/Staging: `false`
  - Production: `true`

### Monitoring Thresholds
- **Memory Alerts**:
  - Dev/Staging: 3GB (80% of 4GB)
  - Production: 2.5GB (62.5% of 4GB)
- **Error Count**:
  - Dev: 5 errors/5min
  - Staging: 10 errors/5min
  - Production: 3 errors/5min

## Deployment Instructions

### Prerequisites
1. [OpenTofu](https://opentofu.org/docs/intro/install/) or Terraform installed
2. AWS CLI configured with appropriate permissions
3. Twilio account and credentials

### Bootstrap (First-time setup)
```bash
cd infrastructure/bootstrap
tofu init
tofu plan
tofu apply
```

### Deploy Environment
```bash
# Choose your environment
cd infrastructure/environments/[dev|staging|prod]

# Initialize
tofu init

# Copy and customize the terraform.tfvars file
cp terraform.tfvars terraform.tfvars.local
# Edit terraform.tfvars.local with your actual values

# Plan and apply
tofu plan -var-file="terraform.tfvars.local"
tofu apply -var-file="terraform.tfvars.local"
```

## Required Variables

Each environment requires these variables to be configured:

### Essential Configuration
- `domain_name`: Your domain for SSL certificate
- `hosted_zone_id`: Route53 hosted zone ID
- `twilio_auth_token`: Your Twilio authentication token

### Optional Configuration
- `notification_emails`: Email addresses for alerts
- `slack_webhook_url`: Slack webhook for notifications

## Security Best Practices

### For Production Deployments
1. **Use AWS Secrets Manager** for sensitive values instead of terraform.tfvars
2. **Enable AWS Config** for compliance monitoring
3. **Set up AWS GuardDuty** for threat detection
4. **Configure AWS CloudTrail** for audit logging
5. **Use separate AWS accounts** for production isolation
6. **Implement proper IAM roles** with least privilege
7. **Enable MFA** for all administrative access
8. **Set up automated backups** and disaster recovery

### Secrets Management
Instead of storing sensitive values in terraform.tfvars, consider:

```hcl
# Use AWS Secrets Manager
data "aws_secretsmanager_secret_version" "twilio_auth_token" {
  secret_id = "prod/twilio/auth-token"
}

# Use in your configuration
twilio_auth_token = data.aws_secretsmanager_secret_version.twilio_auth_token.secret_string
```

## Environment Promotion Workflow

1. **Develop** in `dev` environment
2. **Test** integration in `staging` environment
3. **Deploy** to `prod` environment with proper approvals

## Troubleshooting

### Common Issues
- **Domain/SSL**: Ensure your hosted zone and domain are correctly configured
- **Permissions**: Verify AWS credentials have necessary permissions
- **State Conflicts**: Each environment uses separate S3 backends
- **Resource Limits**: Check AWS service limits for your account

### Getting Help
- Check the main project README for detailed setup instructions
- Review CloudWatch logs for application issues
- Use the monitoring dashboards created by each environment