terraform {
  required_version = ">= 1.10"
  required_providers {
    aws     = { source = "hashicorp/aws", version = ">= 6.0" }
    archive = { source = "hashicorp/archive", version = ">= 2.4" }
  }
  backend "s3" {
    bucket       = "c4-terraform-state-189575358537"
    key          = "envs/dev/terraform.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
  }
}

provider "aws" {
  region              = "eu-central-1"
  allowed_account_ids = ["189575358537"]
  default_tags {
    tags = { Project = "c4", Environment = "dev", ManagedBy = "terraform" }
  }
}

provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = ["189575358537"]
  default_tags {
    tags = { Project = "c4", Environment = "dev", ManagedBy = "terraform" }
  }
}

variable "domain_name" {
  type        = string
  default     = "dev.c4-leipzig.de"
  description = "Custom hostname. Set to an empty string to use only the cloudfront.net URL."
}

module "app" {
  source = "../../modules/app"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  env                      = "dev"
  domain_name              = var.domain_name
  lambda_source_dir        = "${path.root}/../../../packages/api/dist/lambda"
  allow_localhost_callback = true
  deletion_protection      = false
  budget_email             = "aws@c4-leipzig.de"

  # TEMP: faster push job for testing; remove before merging feature/kalender (default is 5 minutes).
  push_job_rate = "rate(1 minute)"
}

output "app" {
  value = {
    url               = module.app.app_url
    cloudfront_domain = module.app.cloudfront_domain
    distribution_id   = module.app.cloudfront_distribution_id
    web_bucket        = module.app.web_bucket
    user_pool_id      = module.app.user_pool_id
    client_id         = module.app.client_id
    cognito_domain    = module.app.cognito_domain
    dsql_endpoint     = module.app.dsql_endpoint
    profilbild_bucket = module.app.profilbild_bucket
  }
}

output "acm_validation_records" {
  value = module.app.acm_validation_records
}
