# AWS CLI v2

## Quick Reference

<!-- This section is extracted by quick_setup for fast, low-token lookups. -->
<!-- Keep it self-contained: just the commands and config needed to install. -->

**Install (Windows):**
```powershell
# Download MSI installer
curl -o "$env:TEMP\awscli.msi" "https://awscli.amazonaws.com/AWSCLIV2.msi"

# Install silently (requires admin elevation)
Start-Process msiexec.exe -ArgumentList '/i',"$env:TEMP\awscli.msi",'/qn' -Verb RunAs -Wait
```

**Install (macOS):**
```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "/tmp/AWSCLIV2.pkg"
sudo installer -pkg /tmp/AWSCLIV2.pkg -target /
```

**Install (Linux):**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
unzip /tmp/awscliv2.zip -d /tmp && sudo /tmp/aws/install
```

**Verify:** `aws --version`

**Configure a named profile:**
```bash
aws configure set aws_access_key_id <KEY_ID> --profile <profile-name>
aws configure set aws_secret_access_key <SECRET> --profile <profile-name>
aws configure set region us-east-1 --profile <profile-name>
aws configure set output json --profile <profile-name>
aws sts get-caller-identity --profile <profile-name>
```

## Overview

AWS CLI v2 is the unified command-line tool for managing AWS services. Used in this ecosystem primarily for S3 static site deployments, CloudFront CDN management, and IAM user/policy setup for CI/CD pipelines.

## Prerequisites

- An AWS account
- Admin/root access for initial IAM setup
- Windows: the MSI installer requires admin elevation via `Start-Process -Verb RunAs`

## Installation

### Windows

The MSI installer is the only supported method. **winget and bash `msiexec` may not work** — use PowerShell `Start-Process` with `-Verb RunAs` for silent install:

```powershell
curl -o "$env:TEMP\awscli.msi" "https://awscli.amazonaws.com/AWSCLIV2.msi"
Start-Process msiexec.exe -ArgumentList '/i',"$env:TEMP\awscli.msi",'/qn' -Verb RunAs -Wait
```

Default install path: `C:\Program Files\Amazon\AWSCLIV2\aws.exe`

**Important**: After install, the `aws` command may not be in the current shell's PATH. Use the full path or open a new terminal:
```bash
"/c/Program Files/Amazon/AWSCLIV2/aws.exe" --version
```

### macOS

```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "/tmp/AWSCLIV2.pkg"
sudo installer -pkg /tmp/AWSCLIV2.pkg -target /
```

### Linux

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
unzip /tmp/awscliv2.zip -d /tmp
sudo /tmp/aws/install
```

## Configuration

### Named Profiles (Recommended)

Use named profiles to keep project credentials separate from default/root credentials:

```bash
aws configure set aws_access_key_id AKIA... --profile my-project
aws configure set aws_secret_access_key u3E4... --profile my-project
aws configure set region us-east-1 --profile my-project
aws configure set output json --profile my-project
```

Verify: `aws sts get-caller-identity --profile my-project`

Profiles are stored in `~/.aws/credentials` and `~/.aws/config`.

### IAM User Setup for Static Site Projects

For projects deploying to S3 + CloudFront, create a least-privilege IAM user:

```bash
# 1. Create the policy (from a JSON file)
aws iam create-policy \
  --policy-name MyProjectDeploy \
  --policy-document file://infra/iam-policy.json

# 2. Create the user
aws iam create-user --user-name my-project-deploy

# 3. Attach the policy
aws iam attach-user-policy \
  --user-name my-project-deploy \
  --policy-arn "arn:aws:iam::<ACCOUNT_ID>:policy/MyProjectDeploy"

# 4. Create access keys
aws iam create-access-key --user-name my-project-deploy
```

Typical permissions needed for S3 + CloudFront static sites:
- **S3**: CreateBucket, PutObject, GetObject, DeleteObject, PutBucketPolicy, PutBucketPublicAccessBlock, etc.
- **CloudFront**: CreateDistribution, UpdateDistribution, CreateInvalidation, CreateOriginAccessControl, etc.
- **ACM**: RequestCertificate, DescribeCertificate (for SSL certs, us-east-1 only)
- **Route53**: ChangeResourceRecordSets (only if using custom domain)

**Scope S3 permissions** to your bucket name pattern (e.g., `arn:aws:s3:::my-project-*`) for least privilege.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `aws` not found after install (Windows) | Use full path: `"/c/Program Files/Amazon/AWSCLIV2/aws.exe"` or open a new terminal |
| `msiexec` returns exit code 103 in bash | Use PowerShell `Start-Process -Verb RunAs` instead of calling msiexec directly from bash |
| winget not available in Git Bash / MSYS2 | winget is a Windows Store app, not available in all shell environments — use MSI installer directly |
| Access denied creating IAM resources | Ensure you're using root or an admin user for initial IAM setup |
| CloudFront ACM cert must be us-east-1 | ACM certs for CloudFront must be created in us-east-1 regardless of your default region |

## Platform Notes

- **Windows (Git Bash/MSYS2)**: The `aws` binary installs to `C:\Program Files\Amazon\AWSCLIV2\` which may not be in PATH for the current bash session. Either use the full path or restart the terminal.
- **CI/CD (GitHub Actions)**: AWS CLI is pre-installed on `ubuntu-latest` runners. Just configure credentials via `aws-actions/configure-aws-credentials`.

## References

- [Official AWS CLI v2 Install Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS CLI Named Profiles](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10 Pro (Git Bash), AWS CLI 2.34.24*
