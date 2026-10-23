# Cognito user pool: email sign-in, Lite tier, and an "admin" group the API
# checks for archive/delete permissions.

resource "aws_cognito_user_pool" "this" {
  name                = "${var.name}-users"
  user_pool_tier      = "LITE"
  username_attributes = ["email"]
  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 10
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  admin_create_user_config {
    allow_admin_create_user_only = !var.allow_self_signup
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret               = false # browser app: a secret can't be kept secret
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30

  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  description  = "Can archive products, delete expenses and manage the team list"
  user_pool_id = aws_cognito_user_pool.this.id
}
