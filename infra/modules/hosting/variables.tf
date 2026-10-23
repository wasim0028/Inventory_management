variable "name" {
  type        = string
  description = "Amplify app name, e.g. stockroom-dev."
}

variable "github_repository" {
  type        = string
  description = "GitHub repository as owner/name."

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/name."
  }
}

variable "github_access_token" {
  type        = string
  description = "GitHub token Amplify uses to read the repo and add a webhook. Pass via TF_VAR_github_access_token."
  sensitive   = true
}

variable "branch" {
  type        = string
  description = "Git branch Amplify builds, e.g. main or develop."
}

variable "stage" {
  type        = string
  description = "Amplify branch stage."
  default     = "DEVELOPMENT"

  validation {
    condition     = contains(["PRODUCTION", "BETA", "DEVELOPMENT", "EXPERIMENTAL"], var.stage)
    error_message = "stage must be PRODUCTION, BETA, DEVELOPMENT or EXPERIMENTAL."
  }
}

variable "region" {
  type        = string
  description = "AWS region shown to the front end."
}

variable "api_url" {
  type        = string
  description = "API base URL."
}

variable "user_pool_id" {
  type        = string
  description = "Cognito user pool ID."
}

variable "user_pool_client_id" {
  type        = string
  description = "Cognito app client ID."
}

variable "currency" {
  type        = string
  description = "Currency code for money formatting."
  default     = "INR"
}
