output "address" {
  description = "RDS endpoint hostname."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "RDS port."
  value       = aws_db_instance.this.port
}

output "db_name" {
  description = "Application database name."
  value       = aws_db_instance.this.db_name
}

output "identifier" {
  description = "RDS instance identifier (used for CloudWatch dimensions)."
  value       = aws_db_instance.this.identifier
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret RDS created for the master user."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}
