output "project_name" {
  description = "CodeBuild project that runs migrations."
  value       = aws_codebuild_project.this.name
}

output "source_bucket" {
  description = "Bucket the CI uploads server.zip to before starting a build."
  value       = aws_s3_bucket.source.bucket
}

output "source_key" {
  description = "Object key CodeBuild reads its source from."
  value       = local.source_key
}
