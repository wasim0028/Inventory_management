# Offline tests: `terraform init -backend=false && terraform test`
# Mock providers stand in for AWS, so no account or credentials are needed.

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-south-1a", "ap-south-1b"] }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_region" {
    defaults = { region = "ap-south-1" }
  }

  mock_resource "aws_db_instance" {
    defaults = {
      address    = "stockroom-dev.abc123.ap-south-1.rds.amazonaws.com"
      port       = 5432
      db_name    = "inventory"
      identifier = "stockroom-dev"
      master_user_secret = [{
        secret_arn    = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:rds!db-mock-AbCdEf"
        kms_key_id    = "alias/aws/secretsmanager"
        secret_status = "active"
      }]
    }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/stockroom-dev-mock" }
  }
  mock_resource "aws_cognito_user_pool" {
    defaults = {
      id       = "ap-south-1_Mock123"
      arn      = "arn:aws:cognito-idp:ap-south-1:123456789012:userpool/ap-south-1_Mock123"
      endpoint = "cognito-idp.ap-south-1.amazonaws.com/ap-south-1_Mock123"
    }
  }
  mock_resource "aws_amplify_app" {
    defaults = { default_domain = "d1mock.amplifyapp.com" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      api_endpoint  = "https://mockapi.execute-api.ap-south-1.amazonaws.com"
      execution_arn = "arn:aws:execute-api:ap-south-1:123456789012:mockapi"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ap-south-1:123456789012:log-group:mock" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::stockroom-dev-migrations-123456789012" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:ap-south-1:123456789012:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:ap-south-1:123456789012:stockroom-dev-alerts" }
  }
  mock_resource "aws_lambda_function" {
    defaults = {
      arn        = "arn:aws:lambda:ap-south-1:123456789012:function:stockroom-dev-api"
      invoke_arn = "arn:aws:apigateway:ap-south-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-south-1:123456789012:function:stockroom-dev-api/invocations"
    }
  }
}

mock_provider "archive" {
  mock_data "archive_file" {
    defaults = {
      output_path         = "mock.zip"
      output_base64sha256 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="
    }
  }
}

variables {
  alert_email         = "ops@example.com"
  github_access_token = "mock-token"
}

run "dev_stack_without_nat" {
  command = apply

  assert {
    condition     = output.api_url == "https://mockapi.execute-api.ap-south-1.amazonaws.com"
    error_message = "api_url should come from the HTTP API."
  }

  assert {
    condition     = output.site_url == "https://develop.d1mock.amplifyapp.com"
    error_message = "Dev site should deploy the develop branch."
  }

  assert {
    condition     = module.network.nat_enabled == false
    error_message = "NAT Gateway must be off by default."
  }

  assert {
    condition     = length(module.network.private_subnet_ids) == 2
    error_message = "Expected two private subnets."
  }

  assert {
    condition     = startswith(output.db_secret_arn, "arn:aws:secretsmanager:")
    error_message = "Lambda and CodeBuild must receive the RDS-managed secret ARN."
  }
}

run "dev_stack_with_temporary_nat" {
  command = plan

  variables {
    enable_migration_nat = true
  }

  assert {
    condition     = module.network.nat_enabled == true
    error_message = "enable_migration_nat should switch the NAT Gateway on."
  }
}

run "rejects_unknown_environment" {
  command = plan

  variables {
    environment = "staging"
  }

  expect_failures = [var.environment]
}

run "rejects_bad_alert_email" {
  command = plan

  variables {
    alert_email = "not-an-email"
  }

  expect_failures = [var.alert_email]
}
