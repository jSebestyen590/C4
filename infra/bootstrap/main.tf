# Run once with admin credentials (local state): creates the Terraform state bucket and
# the GitHub OIDC trust + deploy roles used by CI.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 6.0" }
    tls = { source = "hashicorp/tls", version = ">= 4.0" }
  }
}

provider "aws" {
  region              = "eu-central-1"
  allowed_account_ids = ["189575358537"]
  profile             = "C4"
  default_tags {
    tags = { Project = "c4", ManagedBy = "terraform" }
  }
}

# The repository is configured with immutable ids in its OIDC subject claim
# (repo:<owner>@<owner_id>/<repo>@<repo_id>:...), not the default repo:<owner>/<repo>:... form.
variable "github_repo" {
  type        = string
  default     = "jSebestyen590@26395410/C4@1395447517"
  description = "Repository as it appears in the OIDC sub claim."
}

variable "envs" {
  type    = list(string)
  default = ["dev", "prod"]
}

data "aws_caller_identity" "current" {}

locals {
  account = data.aws_caller_identity.current.account_id
  region  = "eu-central-1"
}

resource "aws_s3_bucket" "state" {
  bucket = "c4-terraform-state-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "state_logs" {
  bucket = "c4-terraform-state-logs-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "state_logs" {
  bucket                  = aws_s3_bucket.state_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "state_logs" {
  bucket = aws_s3_bucket.state_logs.id
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_policy" "state_logs" {
  bucket = aws_s3_bucket.state_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "S3ServerAccessLogs"
        Effect    = "Allow"
        Principal = { Service = "logging.s3.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.state_logs.arn}/*"
        Condition = {
          ArnLike      = { "aws:SourceArn" = aws_s3_bucket.state.arn }
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.state_logs.arn, "${aws_s3_bucket.state_logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_s3_bucket_logging" "state" {
  bucket        = aws_s3_bucket.state.id
  target_bucket = aws_s3_bucket.state_logs.id
  target_prefix = "state/"
  depends_on    = [aws_s3_bucket_policy.state_logs]
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

# One deploy role per environment; trust is limited to the repo + its GitHub Environment.
resource "aws_iam_role" "deploy" {
  for_each = toset(var.envs)
  name     = "c4-${each.value}-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:environment:${each.value}"
        }
      }
    }]
  })
}

# What the CI deploy role may do: only resources of its own environment (name prefix c4-<env>-*)
# wherever AWS supports resource-level permissions. Cognito pools and DSQL clusters have
# generated ids, so those are scoped by account + region only.
resource "aws_iam_role_policy" "deploy" {
  for_each = aws_iam_role.deploy
  name     = "deploy"
  role     = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Cognito"
        Effect   = "Allow"
        Action   = ["cognito-idp:*"]
        Resource = ["arn:aws:cognito-idp:${local.region}:${local.account}:userpool/*"]
      },
      {
        Sid      = "Dsql"
        Effect   = "Allow"
        Action   = ["dsql:*"]
        Resource = ["arn:aws:dsql:${local.region}:${local.account}:cluster/*"]
      },
      {
        Sid      = "Lambda"
        Effect   = "Allow"
        Action   = ["lambda:*"]
        Resource = ["arn:aws:lambda:${local.region}:${local.account}:function:c4-${each.key}-*"]
      },
      {
        Sid    = "Logs"
        Effect = "Allow"
        Action = ["logs:*"]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account}:log-group:/aws/lambda/c4-${each.key}-*",
          "arn:aws:logs:${local.region}:${local.account}:log-group:/aws/lambda/c4-${each.key}-*:*",
          "arn:aws:logs:${local.region}:${local.account}:log-group:/aws/apigateway/c4-${each.key}",
          "arn:aws:logs:${local.region}:${local.account}:log-group:/aws/apigateway/c4-${each.key}:*",
        ]
      },
      {
        Sid    = "LogsDescribe"
        Effect = "Allow"
        Action = ["logs:DescribeLogGroups"]
        Resource = [
          "arn:aws:logs:${local.region}:${local.account}:log-group::log-stream:",
          "arn:aws:logs:${local.region}:${local.account}:log-group:*",
        ]
      },
      {
        Sid    = "ApiGateway"
        Effect = "Allow"
        Action = ["apigateway:*"]
        Resource = [
          "arn:aws:apigateway:${local.region}::/apis",
          "arn:aws:apigateway:${local.region}::/apis/*",
          "arn:aws:apigateway:${local.region}::/tags/*",
        ]
      },
      {
        Sid    = "CloudFront"
        Effect = "Allow"
        Action = ["cloudfront:*"]
        Resource = [
          "arn:aws:cloudfront::${local.account}:distribution/*",
          "arn:aws:cloudfront::${local.account}:origin-access-control/*",
          "arn:aws:cloudfront::${local.account}:function/c4-${each.key}-*",
        ]
      },
      {
        Sid      = "AcmCertificates"
        Effect   = "Allow"
        Action   = ["acm:*"]
        Resource = ["arn:aws:acm:us-east-1:${local.account}:certificate/*"]
      },
      {
        # RequestCertificate does not support resource-level permissions; pinned to us-east-1.
        Sid       = "AcmRequest"
        Effect    = "Allow"
        Action    = ["acm:RequestCertificate"]
        Resource  = ["*"]
        Condition = { StringEquals = { "aws:RequestedRegion" = "us-east-1" } }
      },
      {
        Sid      = "Budgets"
        Effect   = "Allow"
        Action   = ["budgets:*"]
        Resource = ["arn:aws:budgets::${local.account}:budget/c4-${each.key}"]
      },
      {
        Sid    = "IamEnvRoles"
        Effect = "Allow"
        Action = ["iam:*"]
        Resource = [
          "arn:aws:iam::${local.account}:role/c4-${each.key}-*",
        ]
      },
      {
        Sid    = "S3EnvBuckets"
        Effect = "Allow"
        Action = ["s3:*"]
        Resource = [
          "arn:aws:s3:::c4-${each.key}-*",
          "arn:aws:s3:::c4-${each.key}-*/*",
        ]
      },
      {
        Sid      = "TerraformStateList"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.state.arn]
        Condition = {
          StringLike = { "s3:prefix" = ["envs/${each.key}/*"] }
        }
      },
      {
        Sid      = "TerraformStateObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["${aws_s3_bucket.state.arn}/envs/${each.key}/*"]
      },
    ]
  })
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "deploy_role_arns" {
  value = { for k, r in aws_iam_role.deploy : k => r.arn }
}
