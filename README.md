# Twilio Nova Sonic Starter

Real-time bridge service that connects Twilio Voice calls to AWS Bedrock Nova Sonic for AI-powered voice conversations.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

This repository contains the service implementation and infrastructure used to deploy the bridge to AWS.

## Features

### Core Capabilities
- **Real-time Bidirectional Streaming**: Ultra-low latency audio streaming between Twilio and AWS Bedrock Nova Sonic
- **Advanced Session Management**: Concurrent session handling with automatic cleanup and resource management
- **Intelligent Audio Processing**: Automatic format conversion, quality analysis, and adaptive buffering
- **Real-time Interruption Support**: Natural conversation flow with voice activity detection and model interruption
- **Production-Ready Security**: Webhook signature validation, WebSocket security, and rate limiting

### Observability & Monitoring
- **Comprehensive Metrics**: CloudWatch integration with custom metrics for audio quality, session performance, and system health
- **Advanced Memory Monitoring**: Real-time memory usage tracking, leak detection, and automatic cleanup
- **Unified Tracing**: OTEL and X-Ray integration with intelligent fallback for distributed tracing
- **Health Monitoring**: Multi-dimensional health checks with memory trend analysis and predictive alerts
- **Smart Sampling**: Adaptive sampling rates based on operation type and system load
- **Distributed Tracing**: OpenTelemetry integration with AWS X-Ray for end-to-end request tracing
- **Smart Sampling**: Intelligent trace sampling to optimize performance while maintaining observability
- **Health Monitoring**: Multiple health check endpoints with detailed system status reporting

### Enterprise Features
- **Auto-scaling Infrastructure**: ECS-based deployment with Application Load Balancer and auto-scaling
- **High Availability**: Multi-AZ deployment with health checks and automatic failover
- **Secure by Design**: VPC isolation, SSL/TLS termination, and comprehensive security controls
- **Infrastructure as Code**: Complete OpenTofu/Terraform infrastructure definitions

## Architecture

```
┌─────────────┐    WebSocket     ┌─────────────────┐    Bidirectional    ┌─────────────┐
│   Twilio    │ ◄──────────────► │  Bridge Service │ ◄─────────────────► │ AWS Bedrock │
│   Voice     │   (Media Stream) │                 │   (Nova Sonic API)  │ Nova Sonic  │
└─────────────┘                  └─────────────────┘                     └─────────────┘
                                          │
                                          ▼
                                 ┌─────────────────┐
                                 │   Observability │
                                 │   CloudWatch    │
                                 │   X-Ray Tracing │
                                 └─────────────────┘
```

### Infrastructure Architecture
```
┌─────────────┐    HTTPS/WSS     ┌─────────────────┐    Private Network    ┌─────────────┐
│  Internet   │ ◄──────────────► │  Application    │ ◄───────────────────► │     ECS     │
│   (Twilio)  │                  │  Load Balancer  │                       │   Service   │
└─────────────┘                  └─────────────────┘                       └─────────────┘
                                          │                                        │
                                          ▼                                        ▼
                                 ┌─────────────────┐                      ┌─────────────┐
                                 │    Route53      │                      │   Private   │
                                 │   SSL/TLS       │                      │   Subnets   │
                                 └─────────────────┘                      └─────────────┘
```


Repository layout

- [`backend/twilio-bedrock-bridge`](backend/twilio-bedrock-bridge/README.md:1) — Application source, tests, Dockerfile and project README.
- `infrastructure/` — OpenTofu/Terraform infrastructure modules and environment configs.
- `scripts/` — Build and deployment helpers.

## Quick Start

### Prerequisites

- [OpenTofu](https://opentofu.org/docs/intro/install/) or Terraform installed
- AWS CLI configured with appropriate permissions
- Docker installed
- Node.js 18+ and npm
- Twilio account

### 1. Clone and Setup

```bash
git clone https://github.com/paulobrien/twilio-bedrock-bridge.git
cd twilio-bedrock-bridge
```

### 2. Twilio Setup

#### Get a Twilio Phone Number
1. Log into your [Twilio Console](https://console.twilio.com/)
2. Navigate to **Phone Numbers** > **Manage** > **Buy a number**
3. Purchase a phone number with Voice capabilities
4. Note your phone number for later configuration

#### Get Twilio Credentials
1. In the Twilio Console, go to **Account** > **API keys & tokens**
2. Copy your **Account SID** and **Auth Token**
3. Optionally create a new API Key for enhanced security

#### Configure TwiML Application
1. Go to **Develop** > **TwiML** > **TwiML Apps**
2. Create a new TwiML App with these settings:
   - **App Name**: `Bedrock Bridge`
   - **Voice Request URL**: `https://your-domain.com/webhook/voice` (you'll get this after deployment)
   - **Voice Request Method**: `POST`
3. Note the **TwiML App SID**
4. Configure your phone number to use this TwiML App:
   - Go to **Phone Numbers** > **Manage** > **Active numbers**
   - Click your phone number
   - Set **A call comes in** to use your TwiML App

### 3. Deploy Infrastructure with OpenTofu

#### Bootstrap (First-time setup)
```bash
cd infrastructure/bootstrap
tofu init
tofu plan
tofu apply
```

#### Deploy Environment
```bash
cd ../environments/dev  # or prod
tofu init

# Create terraform.tfvars file with your configuration
cat > terraform.tfvars << EOF
# Twilio Configuration
twilio_auth_token = "your_auth_token_here"
twilio_account_sid = "your_account_sid_here"

# Environment Configuration
environment = "dev"
project_name = "twilio-bedrock-bridge"
aws_region = "us-east-1"

# Domain Configuration (optional - required for custom domain)
domain_name = "your-domain.com"
hosted_zone_id = "Z1234567890ABC"  # Required: Route53 hosted zone ID for certificate validation
certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/your-cert-id"

# ECS Configuration
desired_count = 2
cpu = 512
memory = 1024
container_port = 8080

# Auto Scaling Configuration
min_capacity = 1
max_capacity = 10
target_cpu_utilization = 70

# Bedrock Configuration
bedrock_model_id = "amazon.nova-micro-v1:0"
bedrock_region = "us-east-1"

# Monitoring Configuration
enable_detailed_monitoring = true
log_retention_days = 30

# Security Configuration
allowed_cidr_blocks = ["0.0.0.0/0"]  # Restrict in production
enable_waf = true

# Tags
tags = {
  Project     = "twilio-bedrock-bridge"
  Environment = "dev"
  Owner       = "your-team"
  CostCenter  = "engineering"
}
EOF

tofu plan
tofu apply
```

#### Get Deployment URL
After deployment, get your service URL:
```bash
tofu output service_url
```

### 4. Update Twilio Webhook URL
1. Return to your TwiML App in the Twilio Console
2. Update the **Voice Request URL** to: `https://your-service-url/webhook/voice`
3. Save the configuration

### 5. Test the Setup

Call your Twilio phone number to test the AI voice conversation!

### Local Development

For local development and testing:

```bash
cd backend/twilio-bedrock-bridge
npm install
npm test
npm run build
npm start
```

#### Docker Development
```bash
docker build -t twilio-bedrock-bridge backend/twilio-bedrock-bridge
docker run -p 8080:8080 \
  -e TWILIO_AUTH_TOKEN=your_auth_token \
  -e AWS_REGION=us-east-1 \
  twilio-bedrock-bridge
```

## TODO

- [ ] Make Nova Sonic Speak First (High Priority)
- [ ] Add conversation memory/context persistence
- [ ] Implement voice activity detection improvements
- [ ] Add support for multiple languages
- [ ] Enhance error handling and recovery
- [ ] Add conversation analytics and insights
- [ ] Implement custom voice profiles
- [ ] Add webhook retry mechanisms
- [ ] Support for conference calls
- [ ] Add real-time conversation transcription

## Contributing

See [`backend/twilio-bedrock-bridge/README.md`](backend/twilio-bedrock-bridge/README.md:1) for contribution guidelines, testing, and development process.

License

This project is licensed under the MIT License — see the [`LICENSE`](LICENSE:1) file for details.