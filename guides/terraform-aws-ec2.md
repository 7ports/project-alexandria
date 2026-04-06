# Terraform — AWS EC2 Setup

## Overview
Provisioning an EC2 instance with VPC, security groups, IAM role, and Elastic IP using Terraform >= 1.6 with the AWS provider ~> 5.0.

## Quick Reference

### Provider and version requirements
```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}
```

### Latest Amazon Linux 2023 AMI (data source)
```hcl
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}
```

### IAM role for CloudWatch read access
```hcl
resource "aws_iam_role" "ec2" {
  name = "${var.project_name}-ec2-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "cloudwatch_read" {
  name = "cloudwatch-read"
  role = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "tag:GetResources"
      ]
      Resource = "*"
    }]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2.name
}
```

### EC2 instance with user_data bootstrap
```hcl
resource "aws_instance" "main" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.main.id]
  key_name               = aws_key_pair.main.key_name
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    delete_on_termination = true
    encrypted             = true
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    dnf update -y
    dnf install -y docker git
    systemctl enable --now docker
    usermod -aG docker ec2-user
    # Install Docker Compose v2
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  EOF
  )
}
```

### Elastic IP
```hcl
resource "aws_eip" "main" {
  instance = aws_instance.main.id
  domain   = "vpc"
}
```

## Gotchas

### `domain = "vpc"` on EIP
- As of AWS provider ~> 5.x, use `domain = "vpc"` instead of the deprecated `vpc = true`

### user_data runs only on first boot
- Changes to `user_data` do NOT re-run on existing instances — you must replace the instance (`terraform taint aws_instance.main`)

### IAM instance profile propagation delay
- After `terraform apply`, the IAM role may take 10-30 seconds to propagate before the instance can call AWS APIs (like CloudWatch)

### Amazon Linux 2023 vs Amazon Linux 2
- AMI name pattern for AL2023: `al2023-ami-*-x86_64`
- AMI name pattern for AL2: `amzn2-ami-hvm-*-x86_64-gp2`
- Package manager changed from `yum` to `dnf` in AL2023

### Key pair — public key only
- `aws_key_pair` resource takes the PUBLIC key, not the private key
- User provides `ssh-rsa AAAA... email@example.com` as the variable value

## Commands

```bash
terraform init
terraform validate
terraform plan -out=tfplan
terraform apply tfplan

# Destroy (careful!)
terraform destroy
```
