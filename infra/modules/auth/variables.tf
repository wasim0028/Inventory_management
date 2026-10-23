variable "name" {
  type        = string
  description = "Name prefix, e.g. stockroom-dev."
}

variable "allow_self_signup" {
  type        = bool
  description = "Let people create their own accounts. When false, only admins create users (Cognito console or CLI)."
  default     = false
}

variable "deletion_protection" {
  type        = bool
  description = "Prevent the user pool (and every user in it) from being deleted."
  default     = false
}
