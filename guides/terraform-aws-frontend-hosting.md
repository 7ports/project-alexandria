# Terraform — AWS Frontend Hosting (S3 + CloudFront OAC + ACM + Route53)

> Based on real-world Terraform deployment for a React SPA at a custom domain (April 2026).
> Uses CloudFront Origin Access Control (OAC) — the current recommended approach (OAI is deprecated).

---

## Architecture

```
Route53 (DNS)
  └── A/AAAA alias → CloudFront Distribution
        └── OAC → S3 Bucket (ca-central-1)
ACM Certificate (us-east-1) → CloudFront Distribution
```

**Why this stack:**
- S3 stores the static build artifacts — cheap, durable, no servers
- CloudFront distributes globally with HTTPS, edge caching, and compression
- OAC replaces the deprecated OAI for secure S3 access (no public bucket required)
- ACM provides free TLS — **must be in us-east-1** for CloudFront regardless of S3 region
- Route53 handles DNS with ALIAS records (no IP needed, free health-check compatible)

---

## Prerequisites

1. Domain registered and hosted zone in Route53 (or transferable from registrar)
2. S3 bucket for Terraform remote state (create manually — see Bootstrap below)
3. AWS credentials with permissions for S3, CloudFront, ACM, Route53, IAM

---

## Bootstrap: Terraform State Bucket

Create this **once manually** before running `terraform init`:

```bash
aws s3 mb s3://my-project-terraform-state --region ca-central-1
aws s3api put-bucket-versioning \
  --bucket my-project-terraform-state \
  --versioning-configuration Status=Enabled
```

Then reference it in your backend config:

```hcl
# infra/main.tf
terraform {
  backend "s3" {
    bucket = "my-project-terraform-state"
    key    = "frontend/terraform.tfstate"
    region = "ca-central-1"
  }
}
```

---

## Provider Configuration

CloudFront and ACM require resources in `us-east-1`. Use an aliased provider:

```hcl
provider "aws" {
  region = var.aws_region   # e.g. "ca-central-1" for S3 + Route53
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"      # Required for ACM certs used by CloudFront
}
```

> **Gotcha #1 — ACM must be us-east-1:** CloudFront only accepts ACM certificates from `us-east-1`, regardless of where your S3 bucket or Route53 hosted zone is. Creating the cert in any other region causes a `CloudFront can only use certificates in us-east-1` error.

---

## S3 Bucket (private — no public access)

```hcl
resource "aws_s3_bucket" "frontend" {
  bucket = var.s3_bucket_name
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

> **Gotcha #2 — No static website hosting:** Do NOT enable S3 static website hosting. When using CloudFront with OAC, you access S3 as an origin directly (REST API endpoint), not via the website endpoint. Website hosting adds an unnecessary public endpoint.

---

## CloudFront Origin Access Control (OAC)

OAC replaces the deprecated Origin Access Identity (OAI). It uses IAM-style signing for S3 requests.

```hcl
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
```

Then the S3 bucket policy grants CloudFront access:

```hcl
data "aws_iam_policy_document" "cloudfront_s3_access" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.cloudfront_s3_access.json
}
```

> **Gotcha #3 — OAI is deprecated, use OAC:** If you use the old OAI (`aws_cloudfront_origin_access_identity`), AWS will show deprecation warnings and the bucket policy syntax is different. OAC is the current standard.

---

## ACM Certificate

```hcl
resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1   # MUST be us-east-1
  domain_name       = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }
  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "frontend" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}
```

---

## CloudFront Distribution

```hcl
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = "PriceClass_100"  # North America + Europe only

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-${var.s3_bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${var.s3_bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  # SPA routing: return index.html for 404s
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
```

> **Gotcha #4 — SPA routing requires custom_error_response:** Without the 404→200 error response mapping, navigating directly to a React route like `/vessels/123` returns a 403 from S3 (object not found). Add both 403 and 404 mappings returning `index.html` with status 200.

> **Gotcha #5 — PriceClass_100 vs PriceClass_All:** `PriceClass_100` serves from North America and Europe only. For a Toronto-focused app this is fine and cheaper. Use `PriceClass_All` only if you need low-latency globally.

---

## Route53 Hosted Zone + DNS Records

```hcl
resource "aws_route53_zone" "main" {
  name = var.root_domain   # e.g. "example.com" — NOT "app.example.com"
}

# A record (IPv4)
resource "aws_route53_record" "frontend_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name   # e.g. "app.example.com"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# AAAA record (IPv6)
resource "aws_route53_record" "frontend_aaaa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}
```

> **Gotcha #6 — Hosted zone is for root domain, not subdomain:** Create the hosted zone for `example.com`, not `app.example.com`. Route53 hosted zones cover a domain and all its subdomains. Creating a zone for `app.example.com` is almost never what you want.

> **Gotcha #7 — Update NS records at registrar:** After `terraform apply`, get the nameservers from `aws_route53_zone.main.name_servers` and update them at your domain registrar. DNS propagation takes minutes to 48 hours. The `terraform output nameservers` command shows these.

---

## S3 Deploy (CI/CD)

### Two-pass sync pattern

Always deploy in two passes to avoid serving stale HTML that references new hashed asset filenames:

```bash
# Pass 1: Hashed assets (JS/CSS/fonts) — immutable cache
aws s3 sync dist/ s3://$BUCKET_NAME \
  --exclude "*.html" \
  --cache-control "public, max-age=31536000, immutable"

# Pass 2: HTML files — no cache (always re-fetch)
aws s3 sync dist/ s3://$BUCKET_NAME \
  --exclude "*" \
  --include "*.html" \
  --cache-control "no-cache, no-store, must-revalidate"

# Invalidate CloudFront to purge stale index.html from edge
aws cloudfront create-invalidation \
  --distribution-id $CF_DISTRIBUTION_ID \
  --paths "/*"
```

> **Gotcha #8 — Single-pass sync gets stale HTML:** If you sync all files at once with a single cache policy and deploy in a single pass, users may receive the new `index.html` (referencing new hashed JS filenames) before CloudFront has served the new JS files, causing blank pages. The two-pass approach ensures assets exist before the HTML referencing them is served.

---

## IAM Policy for Deploy User

### Required permissions

The Terraform AWS provider reads many S3 and Route53 attributes silently on every `plan`/`refresh` that aren't obvious from the docs. Missing any of these causes `AccessDenied` errors. Use this complete set:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3StaticSite",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket", "s3:DeleteBucket",
        "s3:PutBucketPolicy", "s3:GetBucketPolicy", "s3:DeleteBucketPolicy",
        "s3:PutBucketPublicAccessBlock", "s3:GetBucketPublicAccessBlock",
        "s3:PutBucketVersioning", "s3:GetBucketVersioning",
        "s3:GetBucketLocation", "s3:ListBucket", "s3:ListBucketVersions",
        "s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:DeleteObjectVersion",
        "s3:GetEncryptionConfiguration", "s3:PutEncryptionConfiguration",
        "s3:GetBucketTagging", "s3:PutBucketTagging",
        "s3:GetBucketAcl", "s3:PutBucketAcl",
        "s3:GetBucketCORS", "s3:PutBucketCORS",
        "s3:GetBucketWebsite", "s3:PutBucketWebsite", "s3:DeleteBucketWebsite",
        "s3:GetBucketLogging", "s3:PutBucketLogging",
        "s3:GetBucketNotification", "s3:PutBucketNotification",
        "s3:GetBucketOwnershipControls", "s3:PutBucketOwnershipControls",
        "s3:GetBucketObjectLockConfiguration",
        "s3:GetBucketRequestPayment", "s3:PutBucketRequestPayment",
        "s3:GetReplicationConfiguration",
        "s3:GetAccelerateConfiguration", "s3:PutAccelerateConfiguration",
        "s3:GetLifecycleConfiguration", "s3:PutLifecycleConfiguration",
        "s3:ListBucketMultipartUploads",
        "s3:GetObjectAcl", "s3:PutObjectAcl",
        "s3:GetObjectTagging", "s3:PutObjectTagging"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME",
        "arn:aws:s3:::YOUR-BUCKET-NAME/*"
      ]
    },
    {
      "Sid": "CloudFrontDistribution",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution", "cloudfront:DeleteDistribution",
        "cloudfront:GetDistribution", "cloudfront:GetDistributionConfig",
        "cloudfront:UpdateDistribution",
        "cloudfront:TagResource", "cloudfront:UntagResource", "cloudfront:ListTagsForResource",
        "cloudfront:CreateInvalidation", "cloudfront:GetInvalidation", "cloudfront:ListInvalidations",
        "cloudfront:CreateOriginAccessControl", "cloudfront:DeleteOriginAccessControl",
        "cloudfront:GetOriginAccessControl", "cloudfront:UpdateOriginAccessControl",
        "cloudfront:ListOriginAccessControls", "cloudfront:ListDistributions"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ACMCertificates",
      "Effect": "Allow",
      "Action": [
        "acm:RequestCertificate", "acm:DeleteCertificate",
        "acm:DescribeCertificate", "acm:ListCertificates",
        "acm:GetCertificate", "acm:ListTagsForCertificate", "acm:AddTagsToCertificate"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Route53",
      "Effect": "Allow",
      "Action": [
        "route53:CreateHostedZone", "route53:DeleteHostedZone",
        "route53:GetHostedZone", "route53:ListHostedZones",
        "route53:ChangeResourceRecordSets", "route53:GetChange",
        "route53:ListResourceRecordSets",
        "route53:ListTagsForResource",
        "route53:ChangeTagsForResource"
      ],
      "Resource": "*"
    }
  ]
}
```

> **Gotcha #9 — `s3:GetAccelerateConfiguration` is required even if you don't use transfer acceleration.** The Terraform AWS provider reads it on every `plan`/`refresh`. Missing it causes an `AccessDenied` during `terraform plan` — confusingly the error appears even before any resources are created or modified. The full list of "read-only" S3 permissions that must be present: `GetAccelerateConfiguration`, `GetBucketObjectLockConfiguration`, `GetBucketRequestPayment`, `GetReplicationConfiguration`, `GetBucketLogging`, `GetBucketNotification`, `GetBucketOwnershipControls`.

> **Gotcha #10 — `route53:ChangeTagsForResource` is separate from `route53:ListTagsForResource`.** Terraform's `aws_route53_zone` resource tags the zone as a separate API call after creation. If `ChangeTagsForResource` is missing: the zone IS created successfully, but Terraform then fails, marks the resource as **tainted**, and will try to destroy+recreate it on the next apply. This can wipe and reassign NS records, breaking DNS. Always include both tag permissions.

> **Gotcha #11 — S3 resource ARN pattern must match the actual bucket name.** If your bucket is named `app-production` but your IAM policy covers `arn:aws:s3:::myproject-*`, the policy won't apply. Either use the exact bucket name or ensure your naming convention is consistent with your policy pattern.

### Updating an existing policy (adding permissions)

IAM limits policies to 5 versions. When adding permissions to an existing policy:

```bash
# Create new version and set as default
aws iam create-policy-version \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/PolicyName \
  --policy-document file://infra/iam-policy.json \
  --set-as-default

# Delete the oldest version to stay under the 5-version limit
aws iam delete-policy-version \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/PolicyName \
  --version-id v1  # delete the oldest, never the default
```

> **Note:** IAM policy changes take 5–15 seconds to propagate. If you update a policy and immediately run `terraform apply`, you may still get `AccessDenied`. Wait ~15 seconds before retrying.

---

## AWS Credentials with Named Profiles

> **Gotcha #12 — Terraform does not use named AWS profiles automatically.** If your credentials are stored under a named profile (e.g. `[project-hammer]` in `~/.aws/credentials`) rather than `[default]`, Terraform will fail with `No valid credential sources found` even though `aws sts get-caller-identity --profile project-hammer` works fine.

**Fix:** Set `AWS_PROFILE` before running any terraform command:

```bash
export AWS_PROFILE=project-hammer
terraform init
terraform plan
terraform apply
```

Or inline:
```bash
AWS_PROFILE=project-hammer terraform apply -auto-approve
```

Alternatively, add a `profile` argument to both providers in `main.tf`:
```hcl
provider "aws" {
  region  = "ca-central-1"
  profile = "project-hammer"
}
```

The env var approach is better for CI/CD (set `AWS_PROFILE` as a secret instead of hardcoding the profile name in Terraform config).

---

## Outputs

```hcl
output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.frontend.domain_name
}

output "nameservers" {
  value = aws_route53_zone.main.name_servers
}

output "s3_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}
```

---

## Gotchas Summary

| # | Gotcha | Fix |
|---|---|---|
| 1 | ACM cert not in us-east-1 | Use `provider = aws.us_east_1` alias for ACM |
| 2 | S3 static website hosting enabled | Disable — OAC uses S3 REST API endpoint |
| 3 | OAI instead of OAC | Use `aws_cloudfront_origin_access_control` |
| 4 | SPA routes return 403/404 | Add `custom_error_response` 404→200 and 403→200 |
| 5 | NS records not updated at registrar | After apply, copy `nameservers` output to registrar |
| 6 | Hosted zone for subdomain | Hosted zone must be for root domain (e.g. `example.com`) |
| 7 | Single-pass S3 sync | Use two-pass: hashed assets first (immutable), HTML second (no-cache) |
| 8 | Missing CloudFront invalidation | Always invalidate `/*` after deploy to purge edge cache |
| 9 | `s3:GetAccelerateConfiguration` missing | Add full S3 read permission set — provider reads these on every plan |
| 10 | `route53:ChangeTagsForResource` missing | Include both `ListTagsForResource` AND `ChangeTagsForResource` in Route53 statement |
| 11 | S3 ARN pattern doesn't match bucket name | Use exact bucket name or ensure naming prefix matches policy pattern |
| 12 | Named AWS profile not picked up by Terraform | Set `AWS_PROFILE=profile-name` env var before all terraform commands |

---

## Related Guides

- `aws-cli` — AWS CLI setup and credentials
- `flyio-deployment` — backend hosting on Fly.io

---

*Last updated: 2026-04-05*
*Verified on: Terraform v1.14.8, AWS provider v5.100.0, Windows 10 (Git Bash)*
