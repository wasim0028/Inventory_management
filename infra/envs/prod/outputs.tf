output "api_url" {
  description = "API base URL (NEXT_PUBLIC_API_BASE_URL)."
  value       = module.api.api_url
}

output "user_pool_id" {
  description = "Cognito user pool ID (NEXT_PUBLIC_COGNITO_USER_POOL_ID)."
  value       = module.auth.user_pool_id
}

output "user_pool_client_id" {
  description = "Cognito app client ID (NEXT_PUBLIC_COGNITO_CLIENT_ID)."
  value       = module.auth.client_id
}

output "region" {
  description = "AWS region (NEXT_PUBLIC_AWS_REGION)."
  value       = var.aws_region
}

output "amplify_default_domain" {
  description = "Amplify default domain."
  value       = module.hosting.default_domain
}

output "site_url" {
  description = "URL of the deployed website."
  value       = module.hosting.site_origin
}

output "db_endpoint" {
  description = "RDS endpoint hostname (reachable only from inside the VPC)."
  value       = module.database.address
}

output "db_secret_arn" {
  description = "Secrets Manager secret holding the database credentials."
  value       = module.database.master_user_secret_arn
}

output "migration_project_name" {
  description = "CodeBuild project that runs Prisma migrations."
  value       = module.migrations.project_name
}

output "migration_source_bucket" {
  description = "Bucket the deploy workflow uploads server.zip to."
  value       = module.migrations.source_bucket
}

output "migration_source_key" {
  description = "Object key for the migration source zip."
  value       = module.migrations.source_key
}
