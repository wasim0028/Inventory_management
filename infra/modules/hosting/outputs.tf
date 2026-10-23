output "app_id" {
  description = "Amplify app ID."
  value       = aws_amplify_app.this.id
}

output "default_domain" {
  description = "Amplify default domain, e.g. d1abc.amplifyapp.com."
  value       = aws_amplify_app.this.default_domain
}

output "site_origin" {
  description = "URL of the deployed branch (also the CORS origin for the API)."
  value       = "https://${replace(var.branch, "/", "-")}.${aws_amplify_app.this.default_domain}"
}
