#!/usr/bin/env bash
# deploy/staging/bootstrap-oracle-vm.sh
#
# One-time setup script for an Oracle Cloud Always Free Ubuntu VM.
# Run as root or with sudo.
#
# What this script does:
#   1. Updates package indexes
#   2. Installs Docker Engine, Docker Compose plugin, curl, jq, ca-certificates
#   3. Enables Docker to start on boot
#   4. Creates /opt/shuvmarg/staging with secure ownership
#   5. Copies deploy files to the staging directory
#   6. Documents required Oracle Cloud ingress rules
#   7. Configures UFW if active (allows 22, 80, 443 only)
#
# What this script does NOT do:
#   - Generate or write secrets
#   - Execute a deployment (configure .env first)
#   - Open port 7012 on any firewall
#
# Usage:
#   sudo bash bootstrap-oracle-vm.sh
#
# Run from the directory containing this file, or update SCRIPT_DIR.

set -Eeuo pipefail

DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
STAGING_DIR="/opt/shuvmarg/staging"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()       { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
log_error() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2; }

# ── Require root ─────────────────────────────────────────────────────────────
if [[ "${EUID}" -ne 0 ]]; then
  log_error "This script must be run as root. Use: sudo bash $0"
  exit 1
fi

log "Starting Oracle VM bootstrap for user: ${DEPLOY_USER}"

# ── Update package index ──────────────────────────────────────────────────────
log "Updating package indexes..."
apt-get update -y

# ── Install prerequisites ─────────────────────────────────────────────────────
log "Installing prerequisites..."
apt-get install -y ca-certificates curl jq gnupg lsb-release

# ── Install Docker Engine ─────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
     https://download.docker.com/linux/ubuntu \
     $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  log "Docker installed."
else
  log "Docker already installed: $(docker --version)"
fi

# ── Enable and start Docker ───────────────────────────────────────────────────
systemctl enable docker
systemctl start docker
log "Docker service enabled and started."

# ── Add deploy user to docker group ──────────────────────────────────────────
if id "${DEPLOY_USER}" &>/dev/null; then
  usermod -aG docker "${DEPLOY_USER}"
  log "User '${DEPLOY_USER}' added to docker group."
else
  log "User '${DEPLOY_USER}' not found — skipping docker group assignment."
fi

# ── Create staging directory ──────────────────────────────────────────────────
log "Creating staging directory: ${STAGING_DIR}"
mkdir -p "${STAGING_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${STAGING_DIR}"
chmod 750 "${STAGING_DIR}"

# ── Copy deploy files ─────────────────────────────────────────────────────────
log "Copying deploy files to ${STAGING_DIR}..."

for f in docker-compose.yml Caddyfile deploy.sh .env.example; do
  if [[ -f "${SCRIPT_DIR}/${f}" ]]; then
    cp "${SCRIPT_DIR}/${f}" "${STAGING_DIR}/${f}"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "${STAGING_DIR}/${f}"
  else
    log "  WARNING: ${f} not found in ${SCRIPT_DIR} — skipping"
  fi
done

chmod +x "${STAGING_DIR}/deploy.sh"
log "Deploy files copied."

# ── .env placeholder ─────────────────────────────────────────────────────────
if [[ ! -f "${STAGING_DIR}/.env" ]]; then
  cat > "${STAGING_DIR}/.env" <<'EOF'
# IMPORTANT: Fill in all values before running deploy.sh
# chmod 600 /opt/shuvmarg/staging/.env
BACKEND_IMAGE=
STAGING_API_DOMAIN=
NODE_ENV=production
DEPLOYMENT_ENV=staging
PORT=7012
LOG_LEVEL=info
MONGODB_URL=
SECRET_KEY=
VERIFICATION_TOKEN_SECRET=
ADMIN_MFA_ENCRYPTION_KEY=
FRONTEND_URL=
SPARROW_SMS_TOKEN=
SPARROW_SMS_FROM=TheAlert
EMAIL_SERVICES=gmail
HOST=smtp.gmail.com
EMAIL_PORT=465
USER_EMAIL=
USER_PASSWORD=
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET_NAME=
CLOUDINARY_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_SECRET_KEY=
ESEWA_PRODUCT_CODE=
ESEWA_SECRET_KEY=
PASSENGER_APP_URL=
GOOGLE_MAPS_API_KEY=
MAPBOX_SECRET_TOKEN=
ADMIN_ALERT_USER_ID=
EOF
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${STAGING_DIR}/.env"
  chmod 600 "${STAGING_DIR}/.env"
  log ".env placeholder created at ${STAGING_DIR}/.env (mode 600)."
  log "IMPORTANT: Edit ${STAGING_DIR}/.env and fill in all values before deploying."
else
  log ".env already exists — not overwriting."
fi

# ── UFW firewall (if active) ──────────────────────────────────────────────────
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  log "UFW is active — configuring firewall rules..."
  ufw allow 22/tcp comment "SSH"
  ufw allow 80/tcp comment "HTTP (Caddy)"
  ufw allow 443/tcp comment "HTTPS (Caddy)"
  ufw allow 443/udp comment "HTTP/3 (Caddy)"
  log "UFW rules configured. Port 7012 is NOT opened."
else
  log "UFW not active — skipping firewall configuration."
  log "Configure Oracle Cloud Security List ingress rules manually:"
  log "  TCP  22   (SSH)"
  log "  TCP  80   (HTTP — Caddy redirects to HTTPS)"
  log "  TCP  443  (HTTPS)"
  log "  UDP  443  (HTTP/3 — optional)"
  log "  DO NOT open TCP 7012."
fi

log ""
log "Bootstrap complete."
log ""
log "NEXT STEPS:"
log "  1. Edit ${STAGING_DIR}/.env — fill in ALL values (file is mode 600)"
log "  2. Set ORACLE_STAGING_HOST, ORACLE_STAGING_USER, ORACLE_STAGING_SSH_KEY,"
log "     ORACLE_STAGING_SSH_PORT in GitHub repository secrets"
log "  3. Ensure Oracle Cloud Security List allows TCP 22, 80, 443 (NOT 7012)"
log "  4. Point ${STAGING_API_DOMAIN:-api-staging.shuvmarg.com} DNS A record to this VM's public IP"
log "  5. Push to the staging branch to trigger the first deployment"
