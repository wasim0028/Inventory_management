output "api_url" {
  description = "Base URL of the HTTP API (NEXT_PUBLIC_API_BASE_URL)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "api_id" {
  description = "HTTP API ID (used for CloudWatch dimensions)."
  value       = aws_apigatewayv2_api.this.id
}

output "function_name" {
  description = "Lambda function name."
  value       = aws_lambda_function.api.function_name
}

output "log_group_name" {
  description = "Lambda log group."
  value       = aws_cloudwatch_log_group.lambda.name
}
