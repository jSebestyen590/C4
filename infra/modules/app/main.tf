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

  admin_create_user_config {
    allow_admin_create_user_only = true

    # Cognito requires both {username} and {####} (temporary password) in the message.
    # {username} is an internal id; people sign in with their email address.
    invite_message_template {
      email_subject = "You have been invited to C4"
      email_message = <<-HTML
        <p>Hello,</p>
        <p>you have been invited to C4.</p>
        <p><a href="${local.app_origin}/app/">Open the app and sign in</a><br>
        ${local.app_origin}/app/</p>
        <p>Sign in with this email address and the temporary password <b>{####}</b>.
        You will then be asked to set a new password and to choose a username.</p>
        <p style="color:#666">Internal id: {username}</p>
      HTML
      sms_message   = "C4: sign in at ${local.app_origin}/app/ with your temporary password {####} (id {username})"
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

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${local.name}-web"
  user_pool_id                         = aws_cognito_user_pool.this.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
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
  tags                        = { Name = local.name }
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
        Action = [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
        ]
        Resource = aws_cognito_user_pool.this.arn
      },
    ]
  })
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
  timeout          = 15

  environment {
    variables = {
      USER_POOL_ID  = aws_cognito_user_pool.this.id
      CLIENT_ID     = aws_cognito_user_pool_client.web.id
      DSQL_ENDPOINT = "${aws_dsql_cluster.this.identifier}.dsql.${local.region}.on.aws"
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

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      method         = "$context.httpMethod"
      path           = "$context.path"
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

# Access logs (S3 server access logs + CloudFront standard logs), expired after 90 days.
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
  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration {
      days = 90
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
  cache_policy_optimized                   = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
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
    target_origin_id       = "web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = local.cache_policy_disabled
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/app/*"
    target_origin_id       = "web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = local.cache_policy_optimized
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = local.cache_policy_disabled
    origin_request_policy_id = local.origin_request_policy_all_viewer_no_host
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
