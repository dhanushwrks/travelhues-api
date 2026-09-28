#!/usr/bin/env bash
# One-time setup for Amazon Linux 2023 on a t4g (Arm) instance.
set -euo pipefail

if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "This box is $(uname -m). Use an Arm Amazon Linux 2023 AMI with t4g.micro." >&2
  exit 1
fi

NODE_VERSION=22.19.0

dnf install -y tar xz git
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != "v${NODE_VERSION}" ]]; then
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-arm64.tar.xz" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm -f /tmp/node.tar.xz
fi

npm install -g pm2

if [[ ! -f /swapfile ]]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

pm2 startup systemd -u ec2-user --hp /home/ec2-user
echo "Node $(node -v) and pm2 are installed. Clone the repo as ec2-user next."
