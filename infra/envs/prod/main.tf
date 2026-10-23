locals {
  name = "${var.project}-${var.environment}"
}

module "network" {
  source = "../../modules/network"

  name               = local.name
  region             = var.aws_region
  cidr               = var.vpc_cidr
  availability_zones = var.availability_zones
  endpoint_az_count  = var.endpoint_az_count
  enable_nat         = var.enable_migration_nat
  enable_flow_logs   = var.enable_flow_logs
  log_retention_days = var.log_retention_days
}

module "database" {
  source = "../../modules/database"

  name                  = local.name
  subnet_ids            = module.network.private_subnet_ids
  security_group_id     = module.network.database_security_group_id
  instance_class        = var.db_instance_class
  multi_az              = var.db_multi_az
  backup_retention_days = var.db_backup_retention_days
  deletion_protection   = var.db_deletion_protection
  final_snapshot        = var.db_final_snapshot
  apply_immediately     = var.db_apply_immediately
  monitoring_interval   = var.db_monitoring_interval
  performance_insights  = var.db_performance_insights
}

module "auth" {
  source = "../../modules/auth"

  name                = local.name
  allow_self_signup   = var.allow_self_signup
  deletion_protection = var.cognito_deletion_protection
}

module "hosting" {
  source = "../../modules/hosting"

  name                = local.name
  github_repository   = var.github_repository
  github_access_token = var.github_access_token
  branch              = var.amplify_branch
  stage               = var.amplify_stage
  region              = var.aws_region
  api_url             = module.api.api_url
  user_pool_id        = module.auth.user_pool_id
  user_pool_client_id = module.auth.client_id
  currency            = var.currency
}

module "api" {
  source = "../../modules/api"

  name               = local.name
  source_dir         = var.lambda_source_dir
  subnet_ids         = module.network.private_subnet_ids
  security_group_id  = module.network.lambda_security_group_id
  db_secret_arn      = module.database.master_user_secret_arn
  db_host            = module.database.address
  db_port            = module.database.port
  db_name            = module.database.db_name
  jwt_issuer         = module.auth.issuer_url
  jwt_audience       = module.auth.client_id
  allowed_origins    = concat([module.hosting.site_origin], var.extra_allowed_origins)
  log_retention_days = var.log_retention_days
}

module "migrations" {
  source = "../../modules/migrations"

  name               = local.name
  vpc_id             = module.network.vpc_id
  subnet_ids         = module.network.private_subnet_ids
  security_group_id  = module.network.migrations_security_group_id
  db_secret_arn      = module.database.master_user_secret_arn
  db_host            = module.database.address
  db_port            = module.database.port
  db_name            = module.database.db_name
  log_retention_days = var.log_retention_days
}

module "monitoring" {
  source = "../../modules/monitoring"

  name                   = local.name
  environment            = var.environment
  alert_email            = var.alert_email
  lambda_function_name   = module.api.function_name
  api_id                 = module.api.api_id
  db_instance_identifier = module.database.identifier
  monthly_budget_usd     = var.monthly_budget_usd
}
