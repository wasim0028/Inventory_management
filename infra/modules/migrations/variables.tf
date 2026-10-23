variable "name" {
  type        = string
  description = "Name prefix, e.g. stockroom-dev."
}

variable "vpc_id" {
  type        = string
  description = "VPC for the build container."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnets for the build container (internet via the temporary NAT)."
}

variable "security_group_id" {
  type        = string
  description = "Security group for the build container."
}

variable "db_secret_arn" {
  type        = string
  description = "Secrets Manager ARN with the database username and password."
}

variable "db_host" {
  type        = string
  description = "RDS endpoint hostname."
}

variable "db_port" {
  type        = number
  description = "RDS port."
  default     = 5432
}

variable "db_name" {
  type        = string
  description = "Database name."
}

variable "log_retention_days" {
  type        = number
  description = "Retention for build logs."
  default     = 14
}
