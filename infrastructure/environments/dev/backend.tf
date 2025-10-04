terraform {
  backend "s3" {
    bucket         = "amazon-nova-starter-dev"
    key            = "global/s3/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "amazon-nova-starter-lock-dev"
    encrypt        = true
  }
}
