output "state_bucket" {
  description = "Use as `bucket` in infra/envs/<env>/backend.hcl and as the TF_STATE_BUCKET GitHub variable."
  value       = aws_s3_bucket.state.bucket
}

output "plan_role_arn" {
  description = "Set as the AWS_PLAN_ROLE_ARN repository variable in GitHub."
  value       = aws_iam_role.plan.arn
}

output "deploy_role_arns" {
  description = "Set each as AWS_DEPLOY_ROLE_ARN in the matching GitHub environment."
  value       = { for env, role in aws_iam_role.deploy : env => role.arn }
}
