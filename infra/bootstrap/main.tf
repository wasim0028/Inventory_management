# One-time setup per AWS account (run locally with admin credentials):
#   - S3 bucket for Terraform state (versioned, encrypted, private, TLS only)
#   - GitHub OIDC identity provider
#   - IAM roles GitHub Actions assumes: one read-only role for PR plans and one
#     deploy role per environment. No long-lived AWS keys are stored in GitHub.
#
# This root keeps its own state locally (terraform.tfstate in this folder).
# Keep that file safe, or move it into the bucket afterwards (see README).

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Owner     = var.owner
      Component = "bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  state_bucket = "${var.project}-tfstate-${local.account_id}-${var.aws_region}"
  repo_sub     = "repo:${var.github_repository}"
}

# ------------------------------------------------------------ State bucket

resource "aws_s3_bucket" "state" {
  #checkov:skip=CKV_AWS_18:Access logging needs a second bucket; turn it on (or CloudTrail S3 data events) if you need an audit trail of state reads
  #checkov:skip=CKV_AWS_144:Cross-region replication is not required; versioning protects against mistakes
  #checkov:skip=CKV2_AWS_62:No event notifications are needed for the state bucket
  #checkov:skip=CKV_AWS_145:SSE-S3 encrypts state at rest; a customer KMS key adds cost and key management
  bucket = local.state_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  #checkov:skip=CKV_AWS_145:SSE-S3 encrypts state at rest; a customer KMS key adds cost and key management
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "keep-90-days-of-old-state"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.state]
}

# ------------------------------------------------------------- GitHub OIDC

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

# Plan role: read-only, assumable only from pull requests in this repo.
resource "aws_iam_role" "plan" {
  name = "${var.project}-github-plan"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "${local.repo_sub}:pull_request"
        }
      }
    }]
  })
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# The S3 lock file (use_lockfile) must be written and deleted even during plan.
resource "aws_iam_role_policy" "plan_state_lock" {
  name = "state-lock"
  role = aws_iam_role.plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.state.arn}/*.tflock"
    }]
  })
}

# Deploy roles: one per environment, assumable only by workflow jobs that run
# in the matching GitHub environment (dev or prod).
resource "aws_iam_role" "deploy" {
  for_each = toset(var.environments)
  name     = "${var.project}-github-deploy-${each.key}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "${local.repo_sub}:environment:${each.key}"
        }
      }
    }]
  })
  max_session_duration = 3600
}

# Terraform creates many kinds of resources (VPC, RDS, Lambda, Cognito, Amplify,
# CodeBuild, CloudWatch, KMS, Budgets), so the deploy role uses PowerUserAccess,
# which excludes IAM and account management...
resource "aws_iam_role_policy_attachment" "deploy_power_user" {
  for_each   = aws_iam_role.deploy
  role       = each.value.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# ...plus IAM permissions limited to roles named after this project.
resource "aws_iam_role_policy" "deploy_iam" {
  for_each = aws_iam_role.deploy
  name     = "project-iam-roles"
  role     = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageProjectRoles"
        Effect = "Allow"
        Action = [
          "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole",
          "iam:UpdateAssumeRolePolicy", "iam:TagRole", "iam:UntagRole",
          "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
          "iam:AttachRolePolicy", "iam:DetachRolePolicy",
          "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole", "iam:PassRole",
        ]
        Resource = "arn:aws:iam::${local.account_id}:role/${var.project}-${each.key}-*"
      },
      {
        Sid      = "ReadManagedPolicies"
        Effect   = "Allow"
        Action   = ["iam:GetPolicy", "iam:GetPolicyVersion"]
        Resource = "arn:aws:iam::aws:policy/*"
      },
    ]
  })
}
