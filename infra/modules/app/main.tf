data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  name        = "${var.project}-${var.env}"
  region      = data.aws_region.current.region
  custom      = var.domain_name != null && var.domain_name != ""
  app_host    = local.custom ? var.domain_name : aws_cloudfront_distribution.this.domain_name
  app_origin  = "https://${local.app_host}"
  callback    = ["${local.app_origin}/app/auth/callback"]
  logout      = ["${local.app_origin}/app/"]
  local_cb    = var.allow_localhost_callback ? ["http://localhost:5173/app/auth/callback"] : []
  local_out   = var.allow_localhost_callback ? ["http://localhost:5173/app/"] : []
  cognito_dom = "${aws_cognito_user_pool_domain.this.domain}.auth.${local.region}.amazoncognito.com"
}

# ---------------------------------------------------------------- Cognito
resource "aws_cognito_user_pool" "this" {
  name                     = local.name
  alias_attributes         = ["email", "preferred_username"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  # A changed email only replaces the old one (the login) once the new address was verified.
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  admin_create_user_config {
    allow_admin_create_user_only = true

    # Cognito requires both {username} and {####} (temporary password) in the message.
    # {username} is an internal id; people sign in with their email address.
    invite_message_template {
      email_subject = "Du wurdest zu C4 eingeladen"
      email_message = <<-HTML
        <p>Hallo,</p>
        <p>du wurdest zu C4 eingeladen.</p>
        <p><a href="${local.app_origin}/app/">App öffnen und anmelden</a><br>
        ${local.app_origin}/app/</p>
        <p>Melde dich mit dieser E-Mail-Adresse und dem temporären Passwort <b>{####}</b> an.
        Danach wirst du gebeten, ein neues Passwort und einen Benutzernamen zu wählen und dein Profil auszufüllen.</p>
        <p style="color:#666">Interne ID: {username}</p>
      HTML
      sms_message   = "C4: Melde dich unter ${local.app_origin}/app/ mit dem temporären Passwort {####} an (ID {username})"
    }
  }

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "${local.name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.this.id
}

# The scope aws.cognito.signin.user.admin lets the API change the caller's email with their token.
resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${local.name}-web"
  user_pool_id                         = aws_cognito_user_pool.this.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "aws.cognito.signin.user.admin"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = concat(local.callback, local.local_cb)
  logout_urls                          = concat(local.logout, local.local_out)
  prevent_user_existence_errors        = "ENABLED"
  access_token_validity                = 60
  id_token_validity                    = 60
  refresh_token_validity               = 30
  # Each refresh returns a new refresh token, so the 30 days count from the last use.
  refresh_token_rotation {
    feature                    = "ENABLED"
    retry_grace_period_seconds = 30
  }
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_group" "this" {
  for_each     = toset(var.groups)
  name         = each.value
  user_pool_id = aws_cognito_user_pool.this.id
}

# ---------------------------------------------------------------- Aurora DSQL
resource "aws_dsql_cluster" "this" {
  deletion_protection_enabled = var.deletion_protection
  # Environment is set explicitly: AWS Backup (infra/bootstrap) selects clusters by this tag.
  tags = { Name = local.name, Environment = var.env }
}

# ---------------------------------------------------------------- Lambda
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = var.lambda_source_dir
  output_path = "${path.module}/.build/${local.name}-lambda.zip"
  excludes    = ["index.mjs.map"]
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = 30
}

resource "aws_iam_role" "lambda" {
  name = "${local.name}-api"
  # Ceiling for the role, created in infra/bootstrap; the deploy role may only create roles with it.
  permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${local.name}-workload-boundary"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "api"
  role = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.lambda.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dsql:DbConnectAdmin"]
        Resource = aws_dsql_cluster.this.arn
      },
      {
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.profilbilder.arn}/profilbilder/*",
          "${aws_s3_bucket.profilbilder.arn}/protokollbilder/*",
        ]
      },
      {
        # Finanzarchiv: write and read only (incl. versions). No delete, no BypassGovernanceRetention.
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:ListBucket", "s3:ListBucketVersions"]
        Resource = [aws_s3_bucket.finanzarchiv.arn, "${aws_s3_bucket.finanzarchiv.arn}/*"]
      },
      {
        # Datenexport with Beleg files: the API invokes itself asynchronously (InvocationType Event).
        # Built from the name, not the function ARN, because the function depends on this role.
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${local.region}:${data.aws_caller_identity.current.account_id}:function:${local.name}-api"
      },
      {
        # Deleting a protocol removes all its images (list + delete by prefix).
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = aws_s3_bucket.profilbilder.arn
        Condition = { StringLike = { "s3:prefix" = ["protokollbilder/*"] } }
      },
      {
        # Credentials of the Party-Mail mailbox (filled in by hand, see docs/privatpartys.md).
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.partymail.arn
      },
      {
        # SumUp API key (filled in by hand, see docs/finanzen.md („SumUp“)).
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.sumup.arn
      },
      {
        # OneDrive tokens and VAPID keys: read and written by the API itself (see docs/datenbank.md).
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"]
        Resource = [aws_secretsmanager_secret.onedrive.arn, aws_secretsmanager_secret.vapid.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:ListUsersInGroup",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminUserGlobalSignOut",
        ]
        Resource = aws_cognito_user_pool.this.arn
      },
    ]
  })
}

# ---------------------------------------------------------------- Party-Mail secret
# Only the empty secret is managed here, never a version: the values (JSON with adresse, absenderName,
# benutzer, passwort, imapHost, imapPort, imapTls, smtpHost, smtpPort, smtpSecure, ordnerEingang,
# ordnerGesendet) are entered by hand in the console, so they never end up in the Terraform state.
resource "aws_secretsmanager_secret" "partymail" {
  name                    = "${local.name}-partymail"
  description             = "Mailbox of the Party-Mail (IMAP/SMTP), see docs/privatpartys.md"
  recovery_window_in_days = var.env == "prod" ? 30 : 0
}

# OneDrive client secret and tokens, and the VAPID key pair for web push. Also empty here: the API
# writes the values itself (OneDrive: on connect/token renewal, VAPID: on first use), so they never
# end up in the Terraform state.
resource "aws_secretsmanager_secret" "onedrive" {
  name                    = "${local.name}-onedrive"
  description             = "OneDrive client secret and tokens (JSON), written by the API"
  recovery_window_in_days = var.env == "prod" ? 30 : 0
}

resource "aws_secretsmanager_secret" "vapid" {
  name                    = "${local.name}-vapid"
  description             = "VAPID key pair for web push (JSON), generated by the API on first use"
  recovery_window_in_days = var.env == "prod" ? 30 : 0
}

# ---------------------------------------------------------------- SumUp secret
# Only the empty secret is managed here, never a version: the values (JSON with apiKey, merchantCode
# (optional) and abDatum, the first day to import as YYYY-MM-DD) are entered by hand in the console,
# so they never end up in the Terraform state.
resource "aws_secretsmanager_secret" "sumup" {
  name                    = "${local.name}-sumup"
  description             = "SumUp API key and merchant code for the card revenue, see docs/finanzen.md („SumUp“)"
  recovery_window_in_days = var.env == "prod" ? 30 : 0
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  memory_size      = 512
  # 15 minutes for the asynchronous Datenexport with Beleg files (self-invoke, see docs/finanzen.md).
  # HTTP requests stay capped at 29 s by API Gateway whatever this is; the schedules do not depend on it.
  timeout = 900

  environment {
    variables = {
      USER_POOL_ID        = aws_cognito_user_pool.this.id
      CLIENT_ID           = aws_cognito_user_pool_client.web.id
      DSQL_ENDPOINT       = "${aws_dsql_cluster.this.identifier}.dsql.${local.region}.on.aws"
      PROFILBILD_BUCKET   = aws_s3_bucket.profilbilder.bucket
      FINANZARCHIV_BUCKET = aws_s3_bucket.finanzarchiv.bucket

      PARTYMAIL_SECRET_ARN = aws_secretsmanager_secret.partymail.arn
      ONEDRIVE_SECRET_ARN  = aws_secretsmanager_secret.onedrive.arn
      VAPID_SECRET_ARN     = aws_secretsmanager_secret.vapid.arn
      SUMUP_SECRET_ARN     = aws_secretsmanager_secret.sumup.arn

      # Origin for links in the calendar feed. Without a custom domain it is unknown here (the
      # CloudFront domain would make a dependency cycle), so the feed then carries no links.
      PUBLIC_URL = local.custom ? "https://${var.domain_name}" : ""
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

# ---------------------------------------------------------------- API Gateway (HTTP API)
resource "aws_apigatewayv2_api" "this" {
  name          = local.name
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    issuer   = "https://cognito-idp.${local.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
    audience = [aws_cognito_user_pool_client.web.id]
  }
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /api/health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Calendar apps cannot send a bearer token: the secret token in the URL is the credential.
# More specific than the proxy route below, so it wins.
resource "aws_apigatewayv2_route" "kalender_feed" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /api/kalender/feed/{token}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Contact cards (vCard) are opened by the phone's Contacts app, which cannot send a bearer token:
# the short-lived secret token in the URL is the credential.
resource "aws_apigatewayv2_route" "vcard" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /api/vcard/{token}/{datei}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "protected" {
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "ANY /api/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigateway/${local.name}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  # Rate limit for the whole API (abuse / runaway client protection).
  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      method         = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      latency        = "$context.responseLatency"
      error          = "$context.error.message"
    })
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

# ---------------------------------------------------------------- Push job (EventBridge Scheduler)
# Every 5 minutes the API Lambda is invoked with {"c4":"push-job"} (see lambda.ts): reminders and
# "Dienste fehlen" notifications. About 8,640 invocations per month, well inside the free tier.
resource "aws_iam_role" "scheduler" {
  name = "${local.name}-scheduler"
  # Ceiling for the role, created in infra/bootstrap; the deploy role may only create roles with it.
  permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${local.name}-workload-boundary"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  name = "invoke-api"
  role = aws_iam_role.scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = [aws_lambda_function.api.arn]
    }]
  })
}

resource "aws_scheduler_schedule" "push_job" {
  name                = "${local.name}-push-job"
  description         = "Runs the notification job of the API (reminders, missing Dienste)"
  schedule_expression = var.push_job_rate

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ c4 = "push-job" })

    retry_policy {
      maximum_retry_attempts       = 0
      maximum_event_age_in_seconds = 300
    }
  }
}

# Finanzarchiv export: daily at 03:00 Berlin time (entries since the last export + chain anchor).
resource "aws_scheduler_schedule" "finanz_export" {
  name                         = "${local.name}-finanz-export"
  description                  = "Writes the daily Finanzarchiv export and anchor"
  schedule_expression          = "cron(0 3 * * ? *)"
  schedule_expression_timezone = "Europe/Berlin"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ c4 = "finanz-export" })

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

# The self-invoke of the Datenexport job must not be retried: a retry would build the export twice.
resource "aws_lambda_function_event_invoke_config" "api" {
  function_name          = aws_lambda_function.api.function_name
  maximum_retry_attempts = 0
}

# Party-Mail job: fetches new mails every 2 minutes. A schedule of its own, so the push job keeps its
# 15 seconds. The scheduler role above may invoke the whole function.
resource "aws_scheduler_schedule" "mail_job" {
  name                = "${local.name}-mail-job"
  description         = "Fetches new mails of the Party-Mail into the Privatpartys"
  schedule_expression = var.mail_job_rate

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ c4 = "mail-job" })

    retry_policy {
      maximum_retry_attempts       = 0
      maximum_event_age_in_seconds = 300
    }
  }
}

# SumUp job: fetches new card transactions and payouts (Finanzen slice 7). Does nothing while the
# secret above is empty.
resource "aws_scheduler_schedule" "sumup_job" {
  name                = "${local.name}-sumup-job"
  description         = "Fetches new SumUp transactions and payouts into the Finanzen"
  schedule_expression = var.sumup_job_rate

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.api.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ c4 = "sumup-job" })

    retry_policy {
      maximum_retry_attempts       = 0
      maximum_event_age_in_seconds = 300
    }
  }
}

# ---------------------------------------------------------------- S3 (SPA + static assets)
resource "aws_s3_bucket" "web" {
  bucket        = "${local.name}-web-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.env != "prod"
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.web.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.web.arn, "${aws_s3_bucket.web.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

# ---------------------------------------------------------------- S3 (profile pictures)
# Private; the browser uploads and downloads through short-lived presigned URLs.
resource "aws_s3_bucket" "profilbilder" {
  bucket        = "${local.name}-profilbilder-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.env != "prod"
}

resource "aws_s3_bucket_public_access_block" "profilbilder" {
  bucket                  = aws_s3_bucket.profilbilder.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "profilbilder" {
  bucket = aws_s3_bucket.profilbilder.id
  cors_rule {
    allowed_methods = ["GET", "PUT"]
    allowed_origins = concat([local.app_origin], var.allow_localhost_callback ? ["http://localhost:5173"] : [])
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}

# Overwritten or deleted pictures stay recoverable for 30 days.
resource "aws_s3_bucket_versioning" "profilbilder" {
  bucket = aws_s3_bucket.profilbilder.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "profilbilder" {
  bucket     = aws_s3_bucket.profilbilder.id
  depends_on = [aws_s3_bucket_versioning.profilbilder]
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "profilbilder" {
  bucket = aws_s3_bucket.profilbilder.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.profilbilder.arn, "${aws_s3_bucket.profilbilder.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# Access logs (S3 server access logs + CloudFront standard logs), expired after 90 days.
# ---------------------------------------------------------------- S3 (Finanzarchiv)
# Beleg files and daily exports under Object Lock; nothing is ever deleted. The only lifecycle rule
# drops the parts of failed multipart uploads (Datenexport ZIPs), which are no objects.
resource "aws_s3_bucket" "finanzarchiv" {
  bucket              = "${local.name}-finanzarchiv-${data.aws_caller_identity.current.account_id}"
  object_lock_enabled = true
}

resource "aws_s3_bucket_public_access_block" "finanzarchiv" {
  bucket                  = aws_s3_bucket.finanzarchiv.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "finanzarchiv" {
  bucket = aws_s3_bucket.finanzarchiv.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "finanzarchiv" {
  bucket     = aws_s3_bucket.finanzarchiv.id
  depends_on = [aws_s3_bucket_versioning.finanzarchiv]
  rule {
    default_retention {
      mode = var.finanzarchiv_retention_mode
      days = var.finanzarchiv_retention_days
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "finanzarchiv" {
  bucket = aws_s3_bucket.finanzarchiv.id
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "finanzarchiv" {
  bucket = aws_s3_bucket.finanzarchiv.id
  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = concat([local.app_origin], var.allow_localhost_callback ? ["http://localhost:5173"] : [])
    allowed_headers = ["content-type", "x-amz-checksum-sha256"]
    max_age_seconds = 3000
  }
}

# ---------------------------------------------------------------- CloudTrail (Finanzarchiv)
# Tamper-evident log of the writes to the Finanzarchiv (data events) and, in prod, of the account's
# management events. Log files go to their own Object Lock bucket.
locals {
  trail_name = "${local.name}-trail"
  trail_arn  = "arn:aws:cloudtrail:${local.region}:${data.aws_caller_identity.current.account_id}:trail/${local.trail_name}"
}

resource "aws_s3_bucket" "cloudtrail" {
  bucket              = "${local.name}-cloudtrail-${data.aws_caller_identity.current.account_id}"
  object_lock_enabled = true
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket                  = aws_s3_bucket.cloudtrail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "cloudtrail" {
  bucket     = aws_s3_bucket.cloudtrail.id
  depends_on = [aws_s3_bucket_versioning.cloudtrail]
  rule {
    default_retention {
      mode = var.finanzarchiv_retention_mode
      days = var.finanzarchiv_retention_days
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket     = aws_s3_bucket.cloudtrail.id
  depends_on = [aws_s3_bucket_public_access_block.cloudtrail]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.cloudtrail.arn
        Condition = { StringEquals = { "aws:SourceArn" = local.trail_arn } }
      },
      {
        Sid       = "CloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.cloudtrail.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "aws:SourceArn" = local.trail_arn
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.cloudtrail.arn, "${aws_s3_bucket.cloudtrail.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_cloudtrail" "finanzarchiv" {
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  is_multi_region_trail         = false
  include_global_service_events = false
  enable_log_file_validation    = true
  depends_on                    = [aws_s3_bucket_policy.cloudtrail]

  # Advanced selectors, so that with management events off only the data events are logged.
  dynamic "advanced_event_selector" {
    for_each = var.cloudtrail_verwaltungsereignisse ? [1] : []
    content {
      name = "Management events (write)"
      field_selector {
        field  = "eventCategory"
        equals = ["Management"]
      }
      field_selector {
        field  = "readOnly"
        equals = ["false"]
      }
    }
  }

  advanced_event_selector {
    name = "Finanzarchiv objects (write)"
    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::S3::Object"]
    }
    field_selector {
      field  = "readOnly"
      equals = ["false"]
    }
    field_selector {
      field       = "resources.ARN"
      starts_with = ["${aws_s3_bucket.finanzarchiv.arn}/"]
    }
  }
}

resource "aws_s3_bucket" "logs" {
  bucket        = "${local.name}-logs-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.env != "prod"
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront standard logging delivers via ACL, so ACLs must stay enabled on this bucket.
resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  # Everything else (S3 server access logs under s3/): 90 days.
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration {
      days = 90
    }
  }
  # CloudFront logs contain the request path, and the calendar feed and vCard tokens (unlimited
  # lifetime) are part of the path. Keep them short. Both rules match cloudfront/; S3 expires an
  # object by the earlier date, so these objects go after 14 days.
  rule {
    id     = "expire-cloudfront"
    status = "Enabled"
    filter {
      prefix = "cloudfront/"
    }
    expiration {
      days = 14
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "S3ServerAccessLogs"
        Effect    = "Allow"
        Principal = { Service = "logging.s3.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.logs.arn}/s3/*"
        Condition = {
          ArnLike      = { "aws:SourceArn" = aws_s3_bucket.web.arn }
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.logs.arn, "${aws_s3_bucket.logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_s3_bucket_logging" "web" {
  bucket        = aws_s3_bucket.web.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3/"
  depends_on    = [aws_s3_bucket_policy.logs]
}

# Runtime config for the SPA, so one build serves every environment.
resource "aws_s3_object" "config" {
  bucket        = aws_s3_bucket.web.id
  key           = "app/config.json"
  content_type  = "application/json"
  cache_control = "no-cache"
  content = jsonencode({
    region        = local.region
    userPoolId    = aws_cognito_user_pool.this.id
    clientId      = aws_cognito_user_pool_client.web.id
    cognitoDomain = local.cognito_dom
  })
}

# ---------------------------------------------------------------- ACM (CloudFront needs us-east-1)
resource "aws_acm_certificate" "this" {
  count             = local.custom ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

# Blocks until the validation CNAME (see output acm_validation_records) exists at netcup.
resource "aws_acm_certificate_validation" "this" {
  count           = local.custom ? 1 : 0
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.this[0].arn
  timeouts {
    create = "30m"
  }
}

# ---------------------------------------------------------------- CloudFront
resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "spa" {
  name    = "${local.name}-spa"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var req = event.request;
      var uri = req.uri;
      if (uri === '/' || uri === '') {
        return { statusCode: 302, statusDescription: 'Found', headers: { location: { value: '/app/' } } };
      }
      if (uri === '/app') {
        return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: '/app/' } } };
      }
      // SPA fallback: extensionless paths under /app/ serve index.html.
      if (uri.indexOf('/app/') === 0 && uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
        req.uri = '/app/index.html';
      }
      return req;
    }
  JS
}

# AWS managed policies (fixed ids; avoids List* calls that cannot be scoped in the deploy role).
locals {
  cache_policy_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  # AWS managed response headers policy "Managed-SecurityHeadersPolicy" (fixed id; no data source, the deploy role cannot list policies).
  response_headers_policy_security         = "67f7725c-6f97-4210-82d7-5512b31e9d03"
  cache_policy_disabled                    = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  origin_request_policy_all_viewer_no_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = local.name
  default_root_object = ""
  price_class         = "PriceClass_100"
  aliases             = local.custom ? [var.domain_name] : []
  http_version        = "http2and3"

  origin {
    origin_id                = "web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = "api"
    domain_name = replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "")
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Default: SPA behavior (also handles "/" -> "/app/" via the function).
  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_disabled
    response_headers_policy_id = local.response_headers_policy_security
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/app/*"
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_optimized
    response_headers_policy_id = local.response_headers_policy_security
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_disabled
    response_headers_policy_id = local.response_headers_policy_security
    origin_request_policy_id   = local.origin_request_policy_all_viewer_no_host
  }

  logging_config {
    bucket          = aws_s3_bucket.logs.bucket_domain_name
    prefix          = "cloudfront/"
    include_cookies = false
  }

  depends_on = [aws_s3_bucket_ownership_controls.logs]

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = local.custom ? null : true
    acm_certificate_arn            = local.custom ? aws_acm_certificate_validation.this[0].certificate_arn : null
    ssl_support_method             = local.custom ? "sni-only" : null
    minimum_protocol_version       = local.custom ? "TLSv1.2_2021" : null
  }
}

# ---------------------------------------------------------------- Budget
# The tag filter only works once the "Environment" cost allocation tag is activated in the
# Billing console (Cost allocation tags). It cannot be managed here: the key must already appear
# in billing data (up to 24h after the first tagged resource) and it is account-wide, not per env.
resource "aws_budgets_budget" "this" {
  name         = local.name
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Environment$%s", var.env)]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_email]
  }
}
