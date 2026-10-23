variable "name" {
  type        = string
  description = "Name prefix, e.g. stockroom-dev."
}

variable "environment" {
  type        = string
  description = "Environment tag value the budget filters on."
}

variable "alert_email" {
  type        = string
  description = "Email address for alarms and budget alerts."

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be a valid email address."
  }
}

variable "lambda_function_name" {
  type        = string
  description = "API Lambda function name."
}

variable "api_id" {
  type        = string
  description = "HTTP API ID."
}

variable "db_instance_identifier" {
  type        = string
  description = "RDS instance identifier."
}

variable "api_5xx_rate_percent" {
  type        = number
  description = "Alarm when this percentage of requests return 5xx."
  default     = 5
}

variable "db_connections_threshold" {
  type        = number
  description = "Alarm when database connections exceed this (db.t4g.micro allows about 80)."
  default     = 60
}

variable "monthly_budget_usd" {
  type        = number
  description = "Monthly cost budget in USD for this environment."

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "monthly_budget_usd must be greater than 0."
  }
}
