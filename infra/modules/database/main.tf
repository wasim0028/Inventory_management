# RDS PostgreSQL. The master password is generated and stored in Secrets Manager
# by RDS itself (manage_master_user_password), so it never appears in Terraform
# code, variables or state.

resource "aws_db_subnet_group" "this" {
  name        = var.name
  description = "Private subnets for ${var.name}"
  subnet_ids  = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name        = "${var.name}-postgres${var.engine_major_version}"
  family      = "postgres${var.engine_major_version}"
  description = "Force TLS and log slow queries for ${var.name}"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # log queries slower than 1 s
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role" "monitoring" {
  count = var.monitoring_interval > 0 ? 1 : 0
  name  = "${var.name}-rds-monitoring"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "monitoring" {
  count      = var.monitoring_interval > 0 ? 1 : 0
  role       = aws_iam_role.monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

resource "aws_db_instance" "this" {
  #checkov:skip=CKV_AWS_353:Performance Insights is optional (variable) to keep dev costs at zero
  #checkov:skip=CKV2_AWS_30:Query logging is enabled through log_min_duration_statement in the parameter group
  #checkov:skip=CKV_AWS_293:Deletion protection is a variable: on in prod, off in dev so it can be torn down
  #checkov:skip=CKV_AWS_157:Multi-AZ is a variable: on in prod, off in dev to halve the cost
  #checkov:skip=CKV_AWS_118:Enhanced Monitoring is a variable: 60 s in prod, off in dev
  identifier     = var.name
  engine         = "postgres"
  engine_version = var.engine_major_version
  instance_class = var.instance_class

  db_name  = var.db_name
  username = var.master_username
  port     = 5432

  manage_master_user_password = true

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [var.security_group_id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.multi_az

  iam_database_authentication_enabled = true
  auto_minor_version_upgrade          = true
  apply_immediately                   = var.apply_immediately

  backup_retention_period   = var.backup_retention_days
  backup_window             = "20:00-20:30" # 01:30-02:00 IST
  maintenance_window        = "sun:21:00-sun:21:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = !var.final_snapshot
  final_snapshot_identifier = var.final_snapshot ? "${var.name}-final" : null

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  monitoring_interval             = var.monitoring_interval
  monitoring_role_arn             = var.monitoring_interval > 0 ? aws_iam_role.monitoring[0].arn : null
  performance_insights_enabled    = var.performance_insights

  depends_on = [aws_iam_role_policy_attachment.monitoring]
}
