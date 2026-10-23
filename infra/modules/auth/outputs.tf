output "user_pool_id" {
  description = "Cognito user pool ID (NEXT_PUBLIC_COGNITO_USER_POOL_ID)."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito user pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "client_id" {
  description = "App client ID (NEXT_PUBLIC_COGNITO_CLIENT_ID and the JWT audience)."
  value       = aws_cognito_user_pool_client.web.id
}

output "issuer_url" {
  description = "Token issuer used by the API Gateway JWT authorizer."
  value       = "https://${aws_cognito_user_pool.this.endpoint}"
}
