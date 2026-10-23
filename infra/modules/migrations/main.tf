# Runs `prisma migrate deploy` from inside the VPC with CodeBuild.
#
# Flow (automated in .github/workflows/deploy.yml):
#   1. terraform apply -var enable_migration_nat=true   (temporary NAT Gateway)
#   2. upload server/ as a zip to the source bucket below
#   3. start this CodeBuild project and wait for it
#   4. terraform apply -var enable_migration_nat=false  (NAT Gateway removed)
# CodeBuild needs the NAT only to download npm packages and Prisma's engine.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  project_name = "${var.name}-migrations"
  source_key   = "server.zip"
}

# --------------------------------------------------------- Source bucket

resource "aws_s3_bucket" "source" {
  #checkov:skip=CKV_AWS_18:Access logging for a short-lived build-input bucket is not needed
  #checkov:skip=CKV_AWS_144:Cross-region replication is not needed; the source is rebuilt from Git
  #checkov:skip=CKV2_AWS_62:No event notifications are needed for this bucket
  #checkov:skip=CKV_AWS_145:SSE-S3 is sufficient for application source code; a customer KMS key adds cost
  bucket        = "${local.project_name}-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # only holds rebuildable build inputs
}

resource "aws_s3_bucket_public_access_block" "source" {
  bucket                  = aws_s3_bucket.source.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "source" {
  bucket = aws_s3_bucket.source.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "source" {
  bucket = aws_s3_bucket.source.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "source" {
  #checkov:skip=CKV_AWS_145:SSE-S3 is sufficient for application source code; a customer KMS key adds cost
  bucket = aws_s3_bucket.source.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "source" {
  bucket = aws_s3_bucket.source.id

  rule {
    id     = "expire-old-sources"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "source" {
  bucket = aws_s3_bucket.source.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.source.arn, "${aws_s3_bucket.source.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.source]
}

# ----------------------------------------------------------------- Logs

resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_158:CloudWatch Logs encrypts at rest by default; a customer KMS key adds cost without a requirement here
  #checkov:skip=CKV_AWS_338:Retention is set per environment; one year is not required
  name              = "/aws/codebuild/${local.project_name}"
  retention_in_days = var.log_retention_days
}

# ------------------------------------------------------------------ IAM

resource "aws_iam_role" "codebuild" {
  name = "${local.project_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_iam_role_policy" "codebuild" {
  #checkov:skip=CKV_AWS_290:Only EC2 describe/ENI actions use "*"; AWS does not support resource-level permissions for them
  #checkov:skip=CKV_AWS_355:Only EC2 describe/ENI actions use "*"; AWS does not support resource-level permissions for them
  name = "least-privilege"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WriteOwnLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.this.arn}:*"
      },
      {
        Sid      = "ReadSource"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion"]
        Resource = "${aws_s3_bucket.source.arn}/*"
      },
      {
        Sid      = "ReadSourceBucket"
        Effect   = "Allow"
        Action   = ["s3:GetBucketLocation", "s3:GetBucketAcl"]
        Resource = aws_s3_bucket.source.arn
      },
      {
        Sid      = "ReadDatabaseSecret"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = var.db_secret_arn
      },
      {
        # CodeBuild needs these to run in a VPC; EC2 describe and ENI actions
        # do not support resource-level permissions, so "*" is required.
        Sid    = "VpcNetworking"
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeDhcpOptions",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeVpcs",
        ]
        Resource = "*"
      },
      {
        Sid      = "AttachToOwnSubnets"
        Effect   = "Allow"
        Action   = "ec2:CreateNetworkInterfacePermission"
        Resource = "arn:aws:ec2:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:network-interface/*"
        Condition = {
          StringEquals = { "ec2:AuthorizedService" = "codebuild.amazonaws.com" }
          ArnEquals = {
            "ec2:Subnet" = [
              for id in var.subnet_ids :
              "arn:aws:ec2:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:subnet/${id}"
            ]
          }
        }
      },
    ]
  })
}

# ------------------------------------------------------------- CodeBuild

resource "aws_codebuild_project" "this" {
  #checkov:skip=CKV_AWS_147:Build artifacts are not produced; the default AWS-managed S3 key is used for cache/logs
  name          = local.project_name
  description   = "Applies Prisma migrations to ${var.name}"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 20

  source {
    type     = "S3"
    location = "${aws_s3_bucket.source.bucket}/${local.source_key}"
    buildspec = templatefile("${path.module}/buildspec.yml.tftpl", {
      db_secret_arn = var.db_secret_arn
      db_host       = var.db_host
      db_port       = var.db_port
      db_name       = var.db_name
    })
  }

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    type                        = "LINUX_CONTAINER"
    image                       = "aws/codebuild/amazonlinux-x86_64-standard:5.0"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = false
  }

  vpc_config {
    vpc_id             = var.vpc_id
    subnets            = var.subnet_ids
    security_group_ids = [var.security_group_id]
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.this.name
    }
  }

  depends_on = [aws_iam_role_policy.codebuild]
}
