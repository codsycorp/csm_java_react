# Minimal IaC for CSM Go backend on a single VM (extend for k8s/EKS later).
terraform {
  required_version = ">= 1.5"
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

variable "host" {
  type        = string
  description = "SSH host for deployment target"
}

variable "data_dir" {
  type    = string
  default = "/opt/csm/csm_datas"
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

# GitOps hook: render systemd unit + env file on target host.
resource "null_resource" "csm_go_deploy" {
  triggers = {
    image_tag = var.jwt_secret # rotate secret triggers redeploy
  }

  connection {
    type = "ssh"
    host = var.host
    user = "root"
  }

  provisioner "remote-exec" {
    inline = [
      "mkdir -p /etc/csm",
      "echo 'APP_DATA_DIR=${var.data_dir}' > /etc/csm/csm-go.env",
      "echo 'CSM_ENV=production' >> /etc/csm/csm-go.env",
      "echo 'CSM_REQUIRE_STRONG_JWT=1' >> /etc/csm/csm-go.env",
      "echo 'CSM_STRUCTURED_LOGS=true' >> /etc/csm/csm-go.env",
      "echo 'CSM_METRICS_ENABLED=true' >> /etc/csm/csm-go.env",
      "echo 'CSM_AUDIT_ENABLED=true' >> /etc/csm/csm-go.env",
      "echo 'JWT_SECRET=${var.jwt_secret}' >> /etc/csm/csm-go.env",
      "systemctl daemon-reload || true",
      "systemctl restart csm-go || true",
    ]
  }
}

output "deploy_host" {
  value = var.host
}
