#!/bin/bash

# Script to build a local docker image and push it to ECR

set -e  # Exit on any error

# Configuration
AWS_REGION="us-east-1"
ECR_REPOSITORY_NAME="twilio-novasonic-starter"
IMAGE_TAG="${1:-latest}"  # Use first argument as tag, default to 'latest'

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKERFILE_PATH="$PROJECT_ROOT/backend/twilio-bedrock-bridge/Dockerfile"
BUILD_CONTEXT="$PROJECT_ROOT/backend/twilio-bedrock-bridge"

PLATFORMS="linux/amd64"  # Single architecture to avoid QEMU xattr issues
BUILDER_NAME="builder"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "Starting Docker build and push process..."


# Verify AWS credentials
echo "Verifying AWS credentials..."
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}AWS credentials not configured or invalid.${NC}"
    echo "Please run: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}AWS credentials verified for account: $ACCOUNT_ID${NC}"

# Construct ECR repository URL
ECR_REPOSITORY_URL="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY_NAME"

# Check if ECR repository exists
echo "Checking if ECR repository exists..."
if ! aws ecr describe-repositories --repository-names $ECR_REPOSITORY_NAME --region $AWS_REGION > /dev/null 2>&1; then
    echo -e "${RED}ECR repository '$ECR_REPOSITORY_NAME' not found in region '$AWS_REGION'${NC}"
    echo "Please deploy your infrastructure first using:"
    echo "  cd infrastructure/environments/dev"
    echo "  tofu init && tofu apply"
    if [ -f "$PROJECT_ROOT/terraform.tfvars" ] || [ -f "$PROJECT_ROOT/infrastructure/environments/dev/terraform.tfvars" ]; then
        echo ""
        echo "Note: Terraform may warn about undeclared variables (e.g. 'bedrock_region') when terraform.tfvars contains values not declared as variables."
        echo "Either declare the variable in your configuration, remove it from terraform.tfvars, or set it via TF_VAR_<name> environment variables."
        echo ""
    fi
    exit 1
fi

echo -e "${GREEN}ECR repository found: $ECR_REPOSITORY_URL${NC}"

# Login to ECR
echo "Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_URL

# Check if Dockerfile exists
if [ ! -f "$DOCKERFILE_PATH" ]; then
    echo -e "${RED}❌ Dockerfile not found at $DOCKERFILE_PATH${NC}"
    exit 1
fi

# Build and push AMD64 image using regular Docker build
echo "Building AMD64 Docker image..."
docker build \
    --file $DOCKERFILE_PATH \
    --tag $ECR_REPOSITORY_URL:$IMAGE_TAG \
    $BUILD_CONTEXT

echo "Pushing image to ECR..."
docker push $ECR_REPOSITORY_URL:$IMAGE_TAG

echo -e "${GREEN}Image built and pushed successfully!${NC}"
echo -e "${GREEN}Image URI: $ECR_REPOSITORY_URL:$IMAGE_TAG${NC}"
echo "Architectures: $PLATFORMS"
echo ""
echo "To use this image in your ECS service, update your Terraform variables or use:"
echo "   Image URI: $ECR_REPOSITORY_URL:$IMAGE_TAG"
