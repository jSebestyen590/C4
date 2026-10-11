variable "project" {
  type    = string
  default = "c4"
}

variable "env" {
  type        = string
  description = "Environment name (dev or prod)."
}

variable "domain_name" {
  type        = string
  default     = null
  description = "Custom hostname for the app (e.g. www.c4-leipzig.de). null = use the *.cloudfront.net URL."
}

variable "lambda_source_dir" {
  type        = string
  description = "Directory containing the bundled Lambda (index.mjs)."
}


variable "groups" {
  type    = list(string)
  default = ["admin"]
}

variable "allow_localhost_callback" {
  type        = bool
  default     = false
  description = "Allow http://localhost:5173 as OAuth callback (dev only)."
}

variable "deletion_protection" {
  type    = bool
  default = false
}

variable "budget_email" {
  type = string
}

variable "budget_limit_usd" {
  type    = number
  default = 20
}
