# VPC with private subnets for Lambda, RDS and CodeBuild.
#
# There is no permanent NAT Gateway (it costs ~$35-45/month). Public subnets and
# an Internet Gateway exist (both free) so a NAT Gateway can be switched on with
# `enable_nat = true` only while database migrations run, then switched off again.

# Zones are pinned by name, so a new AZ in the region never changes the network.
data "aws_availability_zones" "selected" {
  state = "available"

  filter {
    name   = "zone-name"
    values = var.availability_zones
  }
}

locals {
  azs      = var.availability_zones
  az_count = length(var.availability_zones)
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_support   = true
  enable_dns_hostnames = true # required for private DNS on interface endpoints

  tags = { Name = var.name }

  lifecycle {
    precondition {
      condition     = length(data.aws_availability_zones.selected.names) == local.az_count
      error_message = "One or more availability_zones are not available in this region."
    }
  }
}

# Lock down the default security group so nothing uses it by accident.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-default-unused" }
}

resource "aws_subnet" "private" {
  count             = local.az_count
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.cidr, 4, count.index)
  availability_zone = local.azs[count.index]

  tags = { Name = "${var.name}-private-${local.azs[count.index]}", Tier = "private" }
}

resource "aws_subnet" "public" {
  count                   = local.az_count
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.cidr, 4, count.index + 8)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false # only the NAT Gateway lives here, with its own Elastic IP

  tags = { Name = "${var.name}-public-${local.azs[count.index]}", Tier = "public" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = var.name }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = local.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-private" }
}

resource "aws_route_table_association" "private" {
  count          = local.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ---------------------------------------------------------------- Temporary NAT

resource "aws_eip" "nat" {
  count  = var.enable_nat ? 1 : 0
  domain = "vpc"
  tags   = { Name = "${var.name}-nat" }

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count         = var.enable_nat ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${var.name}-temporary" }
}

resource "aws_route" "private_nat" {
  count                  = var.enable_nat ? 1 : 0
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[0].id
}

# -------------------------------------------------------------- Security groups

resource "aws_security_group" "lambda" {
  #checkov:skip=CKV2_AWS_5:Attached in another module (api, migrations or database), which checkov cannot follow
  name        = "${var.name}-lambda"
  description = "API Lambda: database and Secrets Manager endpoint only"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-lambda" }
}

resource "aws_security_group" "migrations" {
  #checkov:skip=CKV2_AWS_5:Attached in another module (api, migrations or database), which checkov cannot follow
  name        = "${var.name}-migrations"
  description = "CodeBuild migrations: database, plus HTTPS for npm while NAT is on"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-migrations" }
}

resource "aws_security_group" "database" {
  #checkov:skip=CKV2_AWS_5:Attached in another module (api, migrations or database), which checkov cannot follow
  name        = "${var.name}-database"
  description = "RDS PostgreSQL: inbound 5432 from Lambda and migrations only"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-database" }
}

resource "aws_security_group" "endpoints" {
  name        = "${var.name}-endpoints"
  description = "Interface VPC endpoints: inbound 443 from Lambda and migrations"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-endpoints" }
}

resource "aws_vpc_security_group_egress_rule" "lambda_to_db" {
  security_group_id            = aws_security_group.lambda.id
  description                  = "PostgreSQL to RDS"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
}

resource "aws_vpc_security_group_egress_rule" "lambda_to_endpoints" {
  security_group_id            = aws_security_group.lambda.id
  description                  = "HTTPS to the Secrets Manager endpoint"
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  referenced_security_group_id = aws_security_group.endpoints.id
}

resource "aws_vpc_security_group_egress_rule" "migrations_to_db" {
  security_group_id            = aws_security_group.migrations.id
  description                  = "PostgreSQL to RDS"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
}

resource "aws_vpc_security_group_egress_rule" "migrations_https" {
  security_group_id = aws_security_group.migrations.id
  description       = "HTTPS for npm, Prisma engines, CloudWatch Logs and S3 (via the temporary NAT)"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0" #tfsec:ignore:aws-ec2-no-public-egress-sgr -- needed for package downloads during migrations
}

resource "aws_vpc_security_group_ingress_rule" "db_from_lambda" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from the API Lambda"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.lambda.id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_migrations" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from CodeBuild migrations"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.migrations.id
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_lambda" {
  security_group_id            = aws_security_group.endpoints.id
  description                  = "HTTPS from the API Lambda"
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  referenced_security_group_id = aws_security_group.lambda.id
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_migrations" {
  security_group_id            = aws_security_group.endpoints.id
  description                  = "HTTPS from CodeBuild migrations"
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  referenced_security_group_id = aws_security_group.migrations.id
}

# ------------------------------------------------------------- VPC endpoints

# Lets the Lambda read its database secret without internet access.
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${var.region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = slice(aws_subnet.private[*].id, 0, var.endpoint_az_count)
  security_group_ids  = [aws_security_group.endpoints.id]

  tags = { Name = "${var.name}-secretsmanager" }
}

# ------------------------------------------------------------------ Flow logs

resource "aws_cloudwatch_log_group" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  #checkov:skip=CKV_AWS_158:CloudWatch Logs encrypts at rest by default; a customer KMS key adds cost without a requirement here
  #checkov:skip=CKV_AWS_338:Retention is set per environment; one year is not required for this project
  name              = "/vpc/${var.name}/flow-logs"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "${var.name}-vpc-flow-logs"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "flow_logs" {
  count = var.enable_flow_logs ? 1 : 0
  name  = "write-flow-logs"
  role  = aws_iam_role.flow_logs[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.flow_logs[0].arn}:*"
    }]
  })
}

resource "aws_flow_log" "this" {
  count                = var.enable_flow_logs ? 1 : 0
  vpc_id               = aws_vpc.this.id
  traffic_type         = "REJECT" # rejected traffic only, to keep log volume and cost low
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flow_logs[0].arn
  iam_role_arn         = aws_iam_role.flow_logs[0].arn
}
