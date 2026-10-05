output "cloudfront_domain" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "web_bucket" {
  value = aws_s3_bucket.web.bucket
}

output "app_url" {
  value = "${local.app_origin}/app/"
}

output "user_pool_id" {
  value = aws_cognito_user_pool.this.id
}

output "client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = local.cognito_dom
}

output "dsql_endpoint" {
  value = "${aws_dsql_cluster.this.identifier}.dsql.${local.region}.on.aws"
}

output "acm_validation_records" {
  description = "Create these CNAMEs at netcup, then apply again."
  value = local.custom ? [
    for o in aws_acm_certificate.this[0].domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ] : []
}

output "dns_cname_target" {
  description = "Point the custom hostname (CNAME) at this value."
  value       = aws_cloudfront_distribution.this.domain_name
}
