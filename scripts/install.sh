#!/bin/bash
# Highway — One-command Contabo VPS setup
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[highway]${NC} $1"; }
warn() { echo -e "${YELLOW}[warning]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1"; exit 1; }

echo ""
echo "  ███████╗  ██   ██████  ██   ██ ██     ██  █████  ██    ██ "
echo "  ██  ████  ██  ██       ██   ██ ██     ██ ██   ██  ██  ██  "
echo "  ██████╔╝  ██  ██   ███ ███████ ██  █  ██ ███████   ████   "
echo "  ██        ██  ██    ██ ██   ██ ██ ███ ██ ██   ██    ██    "
echo "  ██        ██   ██████  ██   ██  ███ ███  ██   ██    ██    "
echo ""
echo "  Self-Hosted PaaS Installer"
echo ""

[[ $EUID -eq 0 ]] || err "Run as root: sudo bash install.sh"
[[ -f /etc/os-release ]] && source /etc/os-release || err "Unsupported OS"
[[ "$ID" == "ubuntu" || "$ID" == "debian" ]] || warn "Tested on Ubuntu/Debian — other distros may need adjustments"

# ── System updates ────────────────────────────────────────────────────────────
log "Updating system..."
apt-get update -q && apt-get upgrade -yq
apt-get install -yq curl wget git ufw fail2ban ca-certificates gnupg lsb-release

# ── Docker ────────────────────────────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker && systemctl start docker
  usermod -aG docker "$SUDO_USER" 2>/dev/null || true
else
  log "Docker already installed: $(docker --version)"
fi

# ── Bun ───────────────────────────────────────────────────────────────────────
if ! command -v bun &> /dev/null; then
  log "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# ── BuildKit (for Railpack) ───────────────────────────────────────────────────
log "Starting BuildKit daemon..."
docker rm -f buildkit 2>/dev/null || true
docker run -d --name buildkit --privileged -p 1234:1234 moby/buildkit --addr tcp://0.0.0.0:1234
sleep 3
log "BuildKit started"

# ── Railpack ─────────────────────────────────────────────────────────────────
if ! command -v railpack &> /dev/null; then
  log "Installing Railpack..."
  curl -fsSL https://railpack.sh/install.sh | sh || warn "Railpack install failed — Dockerfile mode still works"
fi

# ── Swap (important on low-RAM VPS) ──────────────────────────────────────────
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -lt 4096 ] && [ ! -f /swapfile ]; then
  log "Adding 4GB swap (RAM: ${TOTAL_RAM}MB)..."
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# ── Clone Highway ─────────────────────────────────────────────────────────────
if [ ! -d /opt/highway ]; then
  log "Cloning Highway..."
  git clone https://github.com/aditya/highway.git /opt/highway 2>/dev/null || {
    log "Creating directory structure..."
    mkdir -p /opt/highway
    cp -r . /opt/highway/ 2>/dev/null || true
  }
fi
cd /opt/highway

# ── .env setup ────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  log "Generating .env..."
  cat > .env << EOF
# ── Platform ─────────────────────────────────────────────
PLATFORM_DOMAIN=deploy.$(hostname -I | awk '{print $1}').nip.io
ACME_EMAIL=admin@example.com

# ── Secrets (auto-generated) ─────────────────────────────
DB_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)

# ── GitHub OAuth ─────────────────────────────────────────
# Create at: https://github.com/settings/applications/new
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ── Cloudflare (for wildcard SSL) ────────────────────────
# Required for *.yourdomain.com SSL via Cloudflare DNS challenge
CLOUDFLARE_API_TOKEN=
EOF
  warn "Edit /opt/highway/.env with your GitHub OAuth credentials before starting"
fi

# ── Install dependencies + migrate ───────────────────────────────────────────
log "Installing dependencies..."
bun install

log "Running database migrations..."
bun run db:migrate

# ── Start ─────────────────────────────────────────────────────────────────────
echo ""
echo "=============================================="
echo "  Highway installed at /opt/highway"
echo ""
echo "  1. Edit /opt/highway/.env with your:"
echo "     - GitHub OAuth app credentials"
echo "     - Your domain name (PLATFORM_DOMAIN)"
echo "     - Cloudflare API token (for wildcard SSL)"
echo ""
echo "  2. Start Highway:"
echo "     cd /opt/highway"
echo "     docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "  Your dashboard: https://\$PLATFORM_DOMAIN"
echo "=============================================="
