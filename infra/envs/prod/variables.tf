# Defaults here are the prod settings. infra/envs/dev has the same variables
# with cheaper development defaults.

# ----------------------------------------------------------------- General

variable "environment" {
  type        = string
  description = "Environment name; also the Environment tag and the GitHub environment."
  default     = "prod"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "project" {
  type        = string
  description = "Project name used in resource names."
  default     = "stockroom"
}

variable "owner" {
  type        = string
  description = "Owner tag value."
  default     = "wasim0028"
}

variable "aws_region" {
  type        = string
  description = "AWS region."
  default     = "ap-south-1"
}

variable "log_retention_days" {
  type        = number
  description = "CloudWatch log retention for Lambda, API, CodeBuild and flow logs."
  default     = 30
}

# ----------------------------------------------------------------- Network

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block."
  default     = "10.30.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "Availability Zones for subnets, pinned by name."
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "endpoint_az_count" {
  type        = number
  description = "Number of AZs with a Secrets Manager endpoint (each adds an hourly charge)."
  default     = 2
}

variable "enable_flow_logs" {
  type        = bool
  description = "Record rejected traffic with VPC flow logs."
  default     = true
}

variable "enable_migration_nat" {
  type        = bool
  description = "Create the temporary NAT Gateway. The deploy workflow sets this to true only while migrations run."
  default     = false
}

# ---------------------------------------------------------------- Database

variable "db_instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t4g.micro"
}

variable "db_multi_az" {
  type        = bool
  description = "Run a standby database in a second AZ."
  default     = true
}

variable "db_backup_retention_days" {
  type        = number
  description = "Automated backup retention in days."
  default     = 7
}

variable "db_deletion_protection" {
  type        = bool
  description = "Block deleting the database."
  default     = true
}

variable "db_final_snapshot" {
  type        = bool
  description = "Take a final snapshot when the database is deleted."
  default     = true
}

variable "db_apply_immediately" {
  type        = bool
  description = "Apply database changes immediately instead of in the maintenance window."
  default     = false
}

variable "db_monitoring_interval" {
  type        = number
  description = "Enhanced Monitoring interval in seconds (0 = off)."
  default     = 60
}

variable "db_performance_insights" {
  type        = bool
  description = "Turn on Performance Insights."
  default     = false
}

# -------------------------------------------------------------------- Auth

variable "allow_self_signup" {
  type        = bool
  description = "Let people create their own accounts."
  default     = false
}

variable "cognito_deletion_protection" {
  type        = bool
  description = "Prevent deleting the user pool."
  default     = true
}

# ----------------------------------------------------------------- Hosting

variable "github_repository" {
  type        = string
  description = "GitHub repository Amplify builds, as owner/name."
  default     = "wasim0028/Inventory_management"
}

variable "github_access_token" {
  type        = string
  description = "GitHub token for Amplify. Set TF_VAR_github_access_token; never put it in a file."
  sensitive   = true
}

variable "amplify_branch" {
  type        = string
  description = "Branch Amplify deploys for this environment."
  default     = "main"
}

variable "amplify_stage" {
  type        = string
  description = "Amplify branch stage."
  default     = "PRODUCTION"
}

variable "currency" {
  type        = string
  description = "Currency code the front end formats money in."
  default     = "INR"
}

# --------------------------------------------------------------------- API

variable "lambda_source_dir" {
  type        = string
  description = "Built Lambda bundle (run `npm ci && npm run build` in server/ first)."
  default     = "../../../server/dist"
}

variable "extra_allowed_origins" {
  type        = list(string)
  description = "Origins allowed by CORS in addition to the Amplify site."
  default     = []
}

# -------------------------------------------------------------- Monitoring

variable "alert_email" {
  type        = string
  description = "Email for alarms and budget alerts. Set TF_VAR_alert_email in CI."

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be a valid email address."
  }
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly budget for this environment in USD."
  default     = 60
}
