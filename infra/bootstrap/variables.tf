variable "aws_region" {
  type        = string
  description = "Region for the state bucket and all environments."
  default     = "ap-south-1"
}

variable "project" {
  type        = string
  description = "Project name used in resource names. Must match `project` in the environment roots."
  default     = "stockroom"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.project))
    error_message = "project must be lowercase letters, digits and hyphens (2-21 characters)."
  }
}

variable "owner" {
  type        = string
  description = "Owner tag value."
  default     = "wasim0028"
}

variable "github_repository" {
  type        = string
  description = "Repository allowed to assume the roles, as owner/name (case-sensitive, as GitHub reports it)."
  default     = "wasim0028/Inventory_management"
}

variable "environments" {
  type        = list(string)
  description = "Environments that get a deploy role. Each must match a GitHub environment name."
  default     = ["dev", "prod"]

  validation {
    condition     = alltrue([for e in var.environments : contains(["dev", "prod"], e)])
    error_message = "environments may only contain dev and prod."
  }
}

variable "create_github_oidc_provider" {
  type        = bool
  description = "Create the GitHub OIDC provider. Set false if this AWS account already has one."
  default     = true
}
