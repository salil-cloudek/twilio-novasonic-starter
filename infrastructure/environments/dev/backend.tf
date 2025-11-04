terraform {
  backend "s3" {
    bucket         = "twillio-nova-starter-dev"
    key            = "global/s3/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "twillio-nova-starter-lock-dev"
    encrypt        = true
  }
}
