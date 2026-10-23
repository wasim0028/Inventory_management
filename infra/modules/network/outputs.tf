output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (Lambda, RDS, CodeBuild)."
  value       = aws_subnet.private[*].id
}

output "lambda_security_group_id" {
  description = "Security group for the API Lambda."
  value       = aws_security_group.lambda.id
}

output "migrations_security_group_id" {
  description = "Security group for the CodeBuild migration project."
  value       = aws_security_group.migrations.id
}

output "database_security_group_id" {
  description = "Security group for RDS."
  value       = aws_security_group.database.id
}

output "nat_enabled" {
  description = "Whether the temporary NAT Gateway currently exists."
  value       = var.enable_nat
}
