variable "name" {
  type        = string
  description = "Name prefix for all resources, e.g. stockroom-dev."
}

variable "region" {
  type        = string
  description = "AWS region, used for VPC endpoint service names."
}

variable "cidr" {
  type        = string
  description = "VPC CIDR block. Split into /20 subnets (private first, public from the 9th block)."

  validation {
    condition     = can(cidrhost(var.cidr, 0)) && tonumber(split("/", var.cidr)[1]) <= 16
    error_message = "cidr must be a valid IPv4 CIDR of /16 or larger."
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "Availability Zones to use, by name (RDS needs at least 2 for its subnet group)."

  validation {
    condition     = length(var.availability_zones) >= 2 && length(var.availability_zones) <= 3
    error_message = "Provide 2 or 3 availability zones."
  }
}

variable "endpoint_az_count" {
  type        = number
  description = "How many AZs get a Secrets Manager endpoint ENI. 1 is cheaper (dev), 2 survives an AZ outage (prod)."
  default     = 1

  validation {
    condition     = var.endpoint_az_count >= 1 && var.endpoint_az_count <= 3
    error_message = "endpoint_az_count must be between 1 and 3."
  }
}

variable "enable_nat" {
  type        = bool
  description = "Create a temporary NAT Gateway so private subnets can reach the internet (used only while migrations run)."
  default     = false
}

variable "enable_flow_logs" {
  type        = bool
  description = "Send rejected-traffic VPC flow logs to CloudWatch Logs."
  default     = false
}

variable "log_retention_days" {
  type        = number
  description = "Retention for the flow log group."
  default     = 14
}
