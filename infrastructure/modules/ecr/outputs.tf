output "repository_arn" {
  description = "Full ARN of the repository"
  value       = aws_ecr_repository.repository.arn
}

output "repository_name" {
  description = "Name of the repository"
  value       = aws_ecr_repository.repository.name
}

output "repository_url" {
  description = "The URL of the repository (in the form aws_account_id.dkr.ecr.region.amazonaws.com/repositoryName)"
  value       = aws_ecr_repository.repository.repository_url
}

output "registry_id" {
  description = "The registry ID where the repository was created"
  value       = aws_ecr_repository.repository.registry_id
}
