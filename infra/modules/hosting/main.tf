# Amplify Hosting for the static Next.js site in client/ (built with the repo's
# amplify.yml). Amplify rebuilds automatically on every push to the branch.
#
# Note: Amplify needs a GitHub token to connect the repository. Terraform keeps
# it in state (AWS gives no way around this), so the state bucket must stay
# private and encrypted.

resource "aws_amplify_app" "this" {
  name         = var.name
  description  = "Stockroom front end (${var.name})"
  repository   = "https://github.com/${var.github_repository}"
  access_token = var.github_access_token
  platform     = "WEB" # static export, no server-side rendering

  enable_branch_auto_build = true

  environment_variables = {
    AMPLIFY_MONOREPO_APP_ROOT = "client"
  }

  # Unknown paths show the site's 404 page instead of Amplify's default.
  custom_rule {
    source = "/<*>"
    status = "404"
    target = "/404.html"
  }

  lifecycle {
    # Amplify does not return the token, so ignore drift on it after creation.
    ignore_changes = [access_token]
  }
}

resource "aws_amplify_branch" "this" {
  app_id            = aws_amplify_app.this.id
  branch_name       = var.branch
  stage             = var.stage
  framework         = "Next.js - SSG"
  enable_auto_build = true

  # Branch-level variables, so the app can be created before the API exists
  # (the API needs the app's domain for CORS).
  environment_variables = {
    NEXT_PUBLIC_API_BASE_URL         = var.api_url
    NEXT_PUBLIC_AWS_REGION           = var.region
    NEXT_PUBLIC_COGNITO_USER_POOL_ID = var.user_pool_id
    NEXT_PUBLIC_COGNITO_CLIENT_ID    = var.user_pool_client_id
    NEXT_PUBLIC_CURRENCY             = var.currency
  }
}
