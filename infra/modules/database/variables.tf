variable "name" {
  type        = string
  description = "Name prefix and RDS identifier, e.g. stockroom-dev."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnets in at least two AZs."
}

variable "security_group_id" {
  type        = string
  description = "Security group that allows 5432 from the Lambda and migrations."
}

variable "engine_major_version" {
  type        = string
  description = "PostgreSQL major version. Minor versions are upgraded automatically."
  default     = "16"
}

variable "instance_class" {
  type        = string
  description = "RDS instance class."
  default     = "db.t4g.micro"
}

variable "db_name" {
  type        = string
  description = "Name of the application database."
  default     = "inventory"
}

variable "master_username" {
  type        = string
  description = "Master username. The password is generated and stored by RDS in Secrets Manager."
  default     = "stockroom"
}

variable "allocated_storage" {
  type        = number
  description = "Initial storage in GB."
  default     = 20
}

variable "max_allocated_storage" {
  type        = number
  description = "Storage autoscaling ceiling in GB."
  default     = 100
}

variable "multi_az" {
  type        = bool
  description = "Run a standby in a second AZ (doubles the instance cost)."
  default     = false
}

variable "backup_retention_days" {
  type        = number
  description = "Automated backup retention in days (1-35)."
  default     = 1

  validation {
    condition     = var.backup_retention_days >= 1 && var.backup_retention_days <= 35
    error_message = "backup_retention_days must be between 1 and 35."
  }
}

variable "deletion_protection" {
  type        = bool
  description = "Block deleting the instance until this is turned off."
  default     = false
}

variable "final_snapshot" {
  type        = bool
  description = "Take a final snapshot when the instance is deleted."
  default     = false
}

variable "apply_immediately" {
  type        = bool
  description = "Apply modifications immediately instead of in the maintenance window."
  default     = false
}

variable "monitoring_interval" {
  type        = number
  description = "Enhanced Monitoring interval in seconds (0 turns it off)."
  default     = 0

  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "monitoring_interval must be one of 0, 1, 5, 10, 15, 30, 60."
  }
}

variable "performance_insights" {
  type        = bool
  description = "Turn on Performance Insights."
  default     = false
}
