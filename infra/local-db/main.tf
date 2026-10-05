# Per-developer throwaway DSQL cluster for local development. State is local to this folder
# (infra/local-db/terraform.tfstate, gitignored), so every developer has their own copy.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 6.0" }
  }
}

provider "aws" {
  region              = "eu-central-1"
  allowed_account_ids = ["189575358537"]
  default_tags {
    tags = { Project = "c4", Environment = "local", ManagedBy = "terraform" }
  }
}

variable "developer" {
  type        = string
  description = "Short name used to tag the cluster."
}

resource "aws_dsql_cluster" "local" {
  deletion_protection_enabled = false
  tags                        = { Name = "c4-local-${var.developer}" }
}

output "dsql_endpoint" {
  value = "${aws_dsql_cluster.local.identifier}.dsql.eu-central-1.on.aws"
}
