# API: Lambda (Express app bundled by `npm run build` in server/) behind an
# API Gateway HTTP API that checks Cognito ID tokens with a JWT authorizer.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  function_name = "${var.name}-api"
}

# Zips the prebuilt bundle. Run `npm ci && npm run build` in server/ first.
data "archive_file" "bundle" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.root}/.build/${local.function_name}.zip"
}

# ------------------------------------------------------------------- Logging

resource "aws_cloudwatch_log_group" "lambda" {
  #checkov:skip=CKV_AWS_158:CloudWatch Logs encrypts at rest by default; a customer KMS key adds cost without a requirement here
  #checkov:skip=CKV_AWS_338:Retention is set per environment (14/30 days); one year is not required
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "access" {
  #checkov:skip=CKV_AWS_158:CloudWatch Logs encrypts at rest by default; a customer KMS key adds cost without a requirement here
  #checkov:skip=CKV_AWS_338:Retention is set per environment (14/30 days); one year is not required
  name              = "/aws/apigateway/${var.name}-http-api"
  retention_in_days = var.log_retention_days
}

# --------------------------------------------------------------------- IAM

resource "aws_iam_role" "lambda" {
  name = "${local.function_name}-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  #checkov:skip=CKV_AWS_290:Only EC2 ENI and X-Ray actions use "*"; AWS does not support resource-level permissions for them
  #checkov:skip=CKV_AWS_355:Only EC2 ENI and X-Ray actions use "*"; AWS does not support resource-level permissions for them
  name = "least-privilege"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WriteOwnLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.lambda.arn}:*"
      },
      {
        Sid      = "ReadDatabaseSecret"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = var.db_secret_arn
      },
      {
        # Lambda needs these to attach to the VPC. EC2 does not support
        # resource-level permissions for these actions, so "*" is required.
        Sid    = "VpcNetworking"
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DescribeSubnets",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses",
        ]
        Resource = "*"
      },
      {
        # X-Ray trace upload does not support resource-level permissions.
        Sid      = "Tracing"
        Effect   = "Allow"
        Action   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
        Resource = "*"
      },
    ]
  })
}

# ------------------------------------------------------------------ Lambda

resource "aws_lambda_function" "api" {
  #checkov:skip=CKV_AWS_116:Synchronous API invocations return errors to the caller; a DLQ only applies to async events
  #checkov:skip=CKV_AWS_115:Reserved concurrency is a variable; new accounts can have a limit of 10, where reserving any would fail
  #checkov:skip=CKV_AWS_272:Code signing is not set up for this project
  #checkov:skip=CKV_AWS_173:Environment variables hold no secrets (only the secret's ARN and the DB host)
  function_name = local.function_name
  description   = "Stockroom inventory API (${var.name})"
  role          = aws_iam_role.lambda.arn

  filename         = data.archive_file.bundle.output_path
  source_code_hash = data.archive_file.bundle.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  memory_size      = var.memory_mb
  timeout          = var.timeout_seconds

  reserved_concurrent_executions = var.reserved_concurrency

  tracing_config {
    mode = "Active"
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [var.security_group_id]
  }

  environment {
    variables = {
      NODE_OPTIONS        = "--enable-source-maps"
      NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem" # trust the RDS certificate authority
      DB_SECRET_ARN       = var.db_secret_arn
      DB_HOST             = var.db_host
      DB_PORT             = tostring(var.db_port)
      DB_NAME             = var.db_name
      DB_SSL              = "true"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda,
  ]
}

# ------------------------------------------------------------- API Gateway

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name}-http-api"
  protocol_type = "HTTP"
  description   = "Stockroom inventory API (${var.name})"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_headers = ["authorization", "content-type"]
    allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    max_age       = 600
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito-jwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = var.jwt_issuer
    audience = [var.jwt_audience]
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "health" {
  #checkov:skip=CKV_AWS_309:Health check is intentionally public and returns no data
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "GET /health"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "ANY /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit   = var.throttle_burst
    throttling_rate_limit    = var.throttle_rate
    detailed_metrics_enabled = true
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      latencyMs      = "$context.responseLatency"
      integrationErr = "$context.integrationErrorMessage"
      authorizerErr  = "$context.authorizer.error"
      userSub        = "$context.authorizer.claims.sub"
    })
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "arn:aws:execute-api:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.this.id}/*/*"
}
