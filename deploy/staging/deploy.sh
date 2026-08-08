#!/usr/bin/env bash
# deploy/staging/deploy.sh
#
# Pulls a new Docker image and deploys it to the staging environment.
# Runs on the Oracle VM — invoked by GitHub Actions over SSH.
#
# Usage:
#   ./deploy.sh <image-reference>
#   Example: ./deploy.sh ghcr.io/dipesh600/shuvmarg-bus-booking-platform-backend:sha-abc1234
#
# Requirements:
#   - Docker and docker compose installed
#   - /opt/shuvmarg/staging/.env present with mode 600
#   - GHCR_TOKEN environment variable set (read-only package token) for docker login
#   - STAGING_API_DOMAIN set in .env for the public health check

set -Eeuo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
DEPLOY_DIR="/opt/shuvmarg/staging"
ENV_FILE="${DEPLOY_DIR}/.env"
LOCK_FILE="/tmp/shuvmarg-staging-deploy.lock"
HEALTH_WAIT_SECONDS=60
HEALTH_CHECK_INTERVAL=5
GHCR_REGISTRY="ghcr.io"
GHCR_USER="${GHCR_USER:-dipesh600}"
EXPECTED_IMAGE_REPOSITORY="ghcr.io/dipesh600/shuvmarg-bus-booking-platform-backend"

# ── Logging ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }
log_error() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2; }

# ── Argument validation ───────────────────────────────────────────────────────
if [[ $# -lt 1 ]] || [[ -z "${1:-}" ]]; then
  log_error "Usage: $0 <image-reference>"
  exit 1
fi

NEW_IMAGE="$1"

if [[ ! "${NEW_IMAGE}" =~ ^ghcr\.io/dipesh600/shuvmarg-bus-booking-platform-backend:sha-[0-9a-f]{40}$ ]]; then
  log_error "Invalid image reference. Expected an immutable SHA image from ${EXPECTED_IMAGE_REPOSITORY}."
  exit 1
fi

log "Starting deployment: ${NEW_IMAGE}"

# ── File and environment validation ──────────────────────────────────────────
if [[ ! -f "${ENV_FILE}" ]]; then
  log_error "Environment file not found: ${ENV_FILE}"
  log_error "Copy deploy/staging/.env.example to ${ENV_FILE} and fill in real values."
  exit 1
fi

ENV_MODE=$(stat -c "%a" "${ENV_FILE}")
if [[ "${ENV_MODE}" != "600" ]]; then
  log_error "${ENV_FILE} must have mode 600; current mode is ${ENV_MODE}."
  exit 1
fi

if ! grep -q '^BACKEND_IMAGE=' "${ENV_FILE}"; then
  log_error "BACKEND_IMAGE entry is missing from ${ENV_FILE}."
  exit 1
fi

read_env_value() {
  local key="$1"
  grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true
}

for required_key in \
  STAGING_API_DOMAIN \
  MONGODB_URL \
  SECRET_KEY \
  VERIFICATION_TOKEN_SECRET \
  FRONTEND_URL; do
  if [[ -z "$(read_env_value "${required_key}")" ]]; then
    log_error "${required_key} must be set in ${ENV_FILE}."
    exit 1
  fi
done

if [[ ! -f "${DEPLOY_DIR}/docker-compose.yml" ]]; then
  log_error "docker-compose.yml not found in ${DEPLOY_DIR}"
  exit 1
fi

if [[ -z "${GHCR_TOKEN:-}" ]]; then
  log_error "GHCR_TOKEN is not set. The VM must have a read-only package token."
  exit 1
fi

# ── Concurrency lock ──────────────────────────────────────────────────────────
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log_error "Another deployment is already running. Exiting."
  exit 1
fi
log "Concurrency lock acquired."

# Keep registry credentials ephemeral instead of writing them to ~/.docker.
DOCKER_AUTH_DIR=$(mktemp -d)
export DOCKER_CONFIG="${DOCKER_AUTH_DIR}"
cleanup_auth() {
  if [[ -n "${DOCKER_AUTH_DIR:-}" && -d "${DOCKER_AUTH_DIR}" ]]; then
    rm -r -- "${DOCKER_AUTH_DIR}"
  fi
}
trap cleanup_auth EXIT

# ── Capture current image for rollback ───────────────────────────────────────
# Prefer the image of the container that is actually running. A previous failed
# deployment may have updated .env before Compose rejected a dependency image.
CONFIGURED_PREVIOUS_IMAGE=$(grep -E '^BACKEND_IMAGE=' "${ENV_FILE}" | cut -d= -f2- || true)
RUNNING_PREVIOUS_IMAGE=$(docker inspect \
  --format='{{.Config.Image}}' \
  shuvmarg-staging-backend 2>/dev/null || true)

if [[ "${RUNNING_PREVIOUS_IMAGE}" =~ ^ghcr\.io/dipesh600/shuvmarg-bus-booking-platform-backend:sha-[0-9a-f]{40}$ ]]; then
  PREVIOUS_IMAGE="${RUNNING_PREVIOUS_IMAGE}"
else
  PREVIOUS_IMAGE="${CONFIGURED_PREVIOUS_IMAGE}"
fi
log "Previous running image: ${PREVIOUS_IMAGE:-<none>}"

# ── Authenticate to GHCR (read-only token from VM) ───────────────────────────
log "Authenticating to GHCR..."
echo "${GHCR_TOKEN}" | docker login "${GHCR_REGISTRY}" -u "${GHCR_USER}" --password-stdin
log "GHCR login successful."

# ── Pull new image ────────────────────────────────────────────────────────────
log "Pulling image: ${NEW_IMAGE}"
docker pull "${NEW_IMAGE}"
log "Image pulled successfully."

# ── Health and rollback helpers ──────────────────────────────────────────────
wait_healthy() {
  local elapsed=0
  local container="shuvmarg-staging-backend"

  log "Waiting for container health (up to ${HEALTH_WAIT_SECONDS}s)..."
  while [[ $elapsed -lt ${HEALTH_WAIT_SECONDS} ]]; do
    local health
    health=$(docker inspect --format='{{.State.Health.Status}}' "${container}" 2>/dev/null || echo "unknown")
    if [[ "${health}" == "healthy" ]]; then
      log "Container is healthy."
      return 0
    fi
    sleep "${HEALTH_CHECK_INTERVAL}"
    elapsed=$((elapsed + HEALTH_CHECK_INTERVAL))
    log "  Container status: ${health} (${elapsed}s elapsed)"
  done

  log_error "Container health check timed out after ${HEALTH_WAIT_SECONDS}s."
  return 1
}

verify_public_health() {
  local domain
  domain=$(read_env_value STAGING_API_DOMAIN)
  local url="https://${domain}/health"
  log "Verifying public health endpoint: ${url}"
  curl --fail --silent --show-error \
    --connect-timeout 10 \
    --max-time 30 \
    "${url}" >/dev/null
}

rollback() {
  log_error "Deployment failed. Rolling back to: ${PREVIOUS_IMAGE:-<none>}"

  if [[ -z "${PREVIOUS_IMAGE:-}" ]]; then
    log_error "No previous image to roll back to. Manual intervention required."
    exit 1
  fi

  sed -i "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${PREVIOUS_IMAGE}|" "${ENV_FILE}"

  if ! docker compose --env-file "${ENV_FILE}" up -d; then
    log_error "Rollback Compose startup failed. Manual intervention required."
    exit 1
  fi
  log "Rollback containers started."

  if wait_healthy; then
    log "Rollback healthy."
  else
    log_error "Rollback health check ALSO failed. Manual intervention required."
  fi

  exit 1
}

# ── Update BACKEND_IMAGE in .env ─────────────────────────────────────────────
# Uses sed in-place; works on both Linux (GNU sed) and macOS (BSD sed via -i '')
sed -i "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${NEW_IMAGE}|" "${ENV_FILE}"
log "BACKEND_IMAGE updated in ${ENV_FILE}."

# ── Deploy ────────────────────────────────────────────────────────────────────
cd "${DEPLOY_DIR}"

log "Running: docker compose up -d"
if ! docker compose --env-file "${ENV_FILE}" up -d; then
  log_error "Compose startup failed before health verification."
  rollback
fi
log "Containers started."

# ── Health check ─────────────────────────────────────────────────────────────
if ! wait_healthy; then
  rollback
fi

if ! verify_public_health; then
  rollback
fi

# ── Prune old images ─────────────────────────────────────────────────────────
# Remove images that are dangling and not the current or previous image.
log "Pruning dangling images (current and previous images preserved)..."
docker image prune -f --filter "until=1h" || true

log "Deployment of ${NEW_IMAGE} completed successfully."
