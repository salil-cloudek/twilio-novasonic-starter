resource "aws_ecr_repository" "repository" {
  name                 = var.repository_name
  image_tag_mutability = var.image_tag_mutability
  force_delete         = var.force_delete

  image_scanning_configuration {
    scan_on_push = var.scan_on_push
  }

  encryption_configuration {
    encryption_type = var.encryption_type
    kms_key         = var.kms_key
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "policy" {
  count      = var.lifecycle_policy != null ? 1 : 0
  repository = aws_ecr_repository.repository.name

  policy = var.lifecycle_policy
}

resource "aws_ecr_repository_policy" "repository_policy" {
  count      = var.repository_policy != null ? 1 : 0
  repository = aws_ecr_repository.repository.name
  policy     = var.repository_policy
}
