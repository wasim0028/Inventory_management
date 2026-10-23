variable "name" {
  type        = string
  description = "Name prefix, e.g. stockroom-dev."
}

variable "source_dir" {
  type        = string
  description = "Folder with the built Lambda bundle (server/dist after `npm run build`)."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnets for the Lambda."
}

variable "security_group_id" {
  type        = string
  description = "Security group for the Lambda."
}

variable "db_secret_arn" {
  type        = string
  description = "Secrets Manager ARN holding the database username and password."
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

variable "jwt_issuer" {
  type        = string
  description = "Cognito issuer URL, https://cognito-idp.<region>.amazonaws.com/<pool id>."
}

variable "jwt_audience" {
  type        = string
  description = "Cognito app client ID accepted by the authorizer."
}

variable "allowed_origins" {
  type        = list(string)
  description = "Front-end origins allowed by CORS, e.g. https://main.d123.amplifyapp.com."

  validation {
    condition     = alltrue([for o in var.allowed_origins : can(regex("^https?://[^/]+$", o))])
    error_message = "Each origin must look like https://host or http://host:port, with no path or trailing slash."
  }
}

variable "memory_mb" {
  type        = number
  description = "Lambda memory in MB."
  default     = 512
}

variable "timeout_seconds" {
  type        = number
  description = "Lambda timeout in seconds (API Gateway stops waiting at 29 s)."
  default     = 15

  validation {
    condition     = var.timeout_seconds >= 1 && var.timeout_seconds <= 29
    error_message = "timeout_seconds must be between 1 and 29."
  }
}

variable "reserved_concurrency" {
  type        = number
  description = "Reserved concurrency for the Lambda. -1 means unreserved (shares the account pool)."
  default     = -1
}

variable "throttle_burst" {
  type        = number
  description = "API Gateway burst limit."
  default     = 50
}

variable "throttle_rate" {
  type        = number
  description = "API Gateway steady-state requests per second."
  default     = 25
}

variable "log_retention_days" {
  type        = number
  description = "Retention for Lambda and access logs."
  default     = 14
}
