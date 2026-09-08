# Oracle Cloud Staging Deployment

Complete runbook for the Shuvmarg backend staging environment on Oracle Cloud Always Free.

---

## Architecture

```
Vercel (staging branch)           — passenger frontend
        │ HTTPS
        ▼
Caddy on Oracle Cloud VM          — TLS termination, reverse proxy
        │ private Docker network
        ▼
Node.js backend container         — shuvmarg-bus-booking-platform-backend
        │ TLS (MongoDB Atlas driver)
        ▼
MongoDB Atlas (staging cluster)   — isolated staging database
```

All secrets stay on the Oracle VM. GitHub Actions never receives runtime secrets.

---

## Oracle Cloud Setup

### Account and VM

- Create an Oracle Cloud Always Free account at https://cloud.oracle.com
- Provision an **Ampere A1 (ARM64)** Always Free compute instance
- **Recommended image**: Ubuntu 22.04 LTS (Canonical)
- **Shape**: VM.Standard.A1.Flex (1 OCPU, 4 GB RAM)
- **Boot volume**: 50 GB minimum
- **Public IP**: Assign a **Reserved Public IP** — this IP must not change after provisioning

The staging workflow deliberately builds a `linux/arm64` image for the A1
instance. Do not substitute an AMD E2 shape without first changing the image
platform and validating the complete deployment on AMD64.

### Ingress Rules (Oracle Security List)

Open only these ports in the Oracle Cloud Security List for the staging subnet:

| Protocol | Port | Purpose                 |
|----------|------|-------------------------|
| TCP      | 22   | SSH access              |
| TCP      | 80   | HTTP (Caddy → HTTPS)    |
| TCP      | 443  | HTTPS                   |
| UDP      | 443  | HTTP/3 (optional)       |

**DO NOT open port 7012.** The backend container is never directly exposed.

### Bootstrap

Copy the deploy files to the VM and run the bootstrap script as root:

```bash
# From your local machine (after cloning the repo)
scp deploy/staging/{bootstrap-oracle-vm.sh,docker-compose.yml,Caddyfile,deploy.sh,.env.example} \
    ubuntu@<VM_PUBLIC_IP>:/tmp/

ssh ubuntu@<VM_PUBLIC_IP>
sudo bash /tmp/bootstrap-oracle-vm.sh
```

The script installs Docker, creates `/opt/shuvmarg/staging`, and places all deploy files there.

---

## MongoDB Atlas — Staging Isolation

> **Critical**: The staging cluster must be **completely separate** from production.

1. Create a new **Atlas Project** named `shuvmarg-staging` (or a new cluster within the same org)
2. Create a database user with read/write access to the staging database only
3. Add the Oracle VM's **static public IP** to the Atlas IP Access List
   - Do not use `0.0.0.0/0` unless temporarily unavoidable for initial setup
4. Copy the connection string to `/opt/shuvmarg/staging/.env` as `MONGODB_URL`
5. **Never** use the production `MONGODB_URL` in staging

---

## DNS

Point the staging API subdomain to the Oracle VM's reserved public IP:

```
api-staging.shuvmarg.com   A   <ORACLE_VM_PUBLIC_IP>
```

Caddy automatically provisions a Let's Encrypt certificate once DNS propagates.

---

## Environment Configuration (on the VM)

The runtime secrets file lives **only on the Oracle VM**:

```bash
sudo nano /opt/shuvmarg/staging/.env
sudo chmod 600 /opt/shuvmarg/staging/.env
```

Fill in every value. See `deploy/staging/.env.example` for the complete list with descriptions.

The `.env` file is **never** committed, pushed, or sent to GitHub Actions.

---

## GHCR Authentication

### GitHub Actions → GHCR (push)

The workflow uses `GITHUB_TOKEN` with `packages: write` permission. No additional secret is needed for pushing images.

### Oracle VM → GHCR (pull)

The VM needs a **read-only** personal access token (classic) or a **fine-grained** token:

1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Create a token with scope: **Read access to packages** for `Dipesh600/Shuvmarg-bus-booking-platform-backend`
3. Set the token as a repository secret named **`GHCR_TOKEN`**

The deploy script reads `GHCR_TOKEN` from the environment (passed via SSH by GitHub Actions) and authenticates with:

```bash
echo "${GHCR_TOKEN}" | docker login ghcr.io -u dipesh600 --password-stdin
```

---

## GitHub Repository Secrets

Add these secrets in **GitHub → Settings → Secrets and variables → Actions**:

| Secret name               | Value                                           |
|---------------------------|-------------------------------------------------|
| `ORACLE_STAGING_HOST`     | Public IP of the Oracle VM                      |
| `ORACLE_STAGING_USER`     | SSH username (e.g. `ubuntu`)                    |
| `ORACLE_STAGING_SSH_KEY`  | Private SSH key (PEM format) for the VM         |
| `ORACLE_STAGING_SSH_PORT` | SSH port (default `22`)                         |
| `GHCR_TOKEN`              | Read-only GitHub package token (for VM pulls)   |

Runtime backend secrets (`MONGODB_URL`, `SECRET_KEY`, etc.) remain **only on the VM** in `/opt/shuvmarg/staging/.env`.

---

## First Deployment

1. Complete all setup steps above
2. Verify DNS has propagated: `dig api-staging.shuvmarg.com`
3. Push to the `staging` branch:
   ```bash
   git push origin staging
   ```
4. The GitHub Actions workflow will:
   - Run CI (tests + file-size check)
   - Build the Docker image and push to GHCR with an immutable SHA tag
   - SSH into the Oracle VM and run `deploy.sh`
5. Monitor the workflow in GitHub → Actions

---

## Health Verification

```bash
# From any machine
curl -fsS https://api-staging.shuvmarg.com/health

# Expected response (HTTP 200):
# {"status":"ok","db":"connected","uptimeSeconds":42,...}

# On the VM
cd /opt/shuvmarg/staging
docker compose logs -f backend    # backend logs
docker compose logs -f caddy      # Caddy TLS/proxy logs
docker compose logs -f clamav     # signature updates and scanner health
docker compose ps                 # container health status
```

---

## Logs

```bash
# Stream backend logs
docker compose -f /opt/shuvmarg/staging/docker-compose.yml logs -f backend

# Stream Caddy logs
docker compose -f /opt/shuvmarg/staging/docker-compose.yml logs -f caddy
```

Docker log rotation is configured: 10 MB per file, 5 files maximum per container.

---

## Restart

```bash
cd /opt/shuvmarg/staging
docker compose restart backend
```

---

## Rollback

### Automatic Rollback

`deploy.sh` automatically rolls back to the previous image if:

- The container health check fails within 60 seconds
- The public HTTPS health endpoint is unreachable after deployment

### Manual Rollback

To roll back to a specific previous image:

```bash
cd /opt/shuvmarg/staging
# Edit BACKEND_IMAGE to the desired SHA tag
sudo nano .env
# e.g. BACKEND_IMAGE=ghcr.io/dipesh600/shuvmarg-bus-booking-platform-backend:sha-abc1234
docker compose up -d
docker compose ps
curl -fsS https://api-staging.shuvmarg.com/health
```

All deployed images are stored in GHCR and identified by immutable SHA tags. Never use the `staging` floating tag for rollback.

---

## Secret Rotation

### MongoDB credentials
1. Create new Atlas user
2. Update `MONGODB_URL` in `/opt/shuvmarg/staging/.env`
3. `docker compose restart backend`
4. Delete old Atlas user

### JWT / Application secret (`SECRET_KEY`)
1. Update `SECRET_KEY` in `/opt/shuvmarg/staging/.env`
2. `docker compose restart backend`
3. All existing tokens are invalidated — users must re-authenticate

### SMS credentials (`SPARROW_SMS_TOKEN`)
1. Update in `/opt/shuvmarg/staging/.env`
2. `docker compose restart backend`

### Payment credentials (`ESEWA_PRODUCT_CODE`, `ESEWA_SECRET_KEY`)
1. Use sandbox credentials in `/opt/shuvmarg/staging/.env`. Keep `NODE_ENV=production`; the staging Compose file explicitly sets `DEPLOYMENT_ENV=staging` so both checkout and verification select sandbox endpoints.
2. Set `PASSENGER_APP_URL` to the HTTPS staging passenger website. Compose rejects a missing value. Live endpoint overrides are rejected in staging, and test credentials/sandbox endpoints are rejected in live production.
3. Recreate the backend container through the normal staging deployment workflow so changed environment values are loaded. Restarting the existing container does not reload its environment.
4. Review pending attempts before changing merchant or environment. New attempts save their payment environment; initiation retries and finalization refuse to repurpose an attempt under different payment configuration.

### Storage credentials (AWS, Cloudinary)
1. Update affected variables in `/opt/shuvmarg/staging/.env`
2. `docker compose restart backend`

### GHCR read token (`GHCR_TOKEN`)
1. Generate new fine-grained token in GitHub Settings
2. Update the `GHCR_TOKEN` repository secret in GitHub
3. No VM restart needed — the token is injected at deploy time

### SSH key (`ORACLE_STAGING_SSH_KEY`)
1. Generate a new key pair: `ssh-keygen -t ed25519 -C "staging-deploy"`
2. Add the new public key to the VM: `~/.ssh/authorized_keys`
3. Update `ORACLE_STAGING_SSH_KEY` in GitHub secrets
4. Remove the old public key from the VM
5. Verify a new deployment works before removing the old key

---

## Troubleshooting

### MongoDB connection failure

```bash
docker compose logs backend | grep "MONGODB\|mongoose\|connect"
```

- Verify `MONGODB_URL` in `.env` points to the staging cluster
- Verify the Oracle VM's public IP is in the Atlas network access list
- The `/health` endpoint returns HTTP 503 when MongoDB is disconnected

### CORS rejection

- Verify `FRONTEND_URL` in `.env` contains the staging frontend URL
- Multiple origins: comma-separated — `https://a.com,https://b.com`
- Check the browser developer tools for the rejected `Origin` header value

### HTTPS certificate failure

```bash
docker compose logs caddy | grep "error\|certificate\|ACME"
```

- Verify DNS is pointing to the correct IP: `dig api-staging.shuvmarg.com`
- Let's Encrypt rate limits: max 5 certificates per domain per week
- Port 80 must be accessible for the ACME HTTP challenge

### Container unhealthy

```bash
docker compose ps
docker inspect shuvmarg-staging-backend | python3 -m json.tool | grep -A 10 '"Health"'
```

- Check logs for startup errors
- Verify `MONGODB_URL` is correct (most common cause)

### GHCR authentication failure on VM

```bash
# Test manually on the VM
echo "${GHCR_TOKEN}" | docker login ghcr.io -u dipesh600 --password-stdin
```

- Verify `GHCR_TOKEN` in GitHub secrets has **packages: read** scope
- Fine-grained tokens must have access to the specific repository

### Staging frontend still using old API URL

- Update the staging deployment of the passenger website with `VITE_API_URL=https://api-staging.shuvmarg.com`
- Redeploy the frontend on Vercel from the staging branch

### Oracle firewall vs. cloud ingress rules

Oracle Cloud has **two independent** firewall layers:
1. **Oracle Security List** (cloud-level): configured in the OCI Console
2. **iptables / UFW** (OS-level): on the VM itself

Both must allow ports 22, 80, and 443. The bootstrap script handles UFW if active.

### Port 7012 accidentally exposed

Port 7012 must **never** be in the Oracle Security List ingress rules.
If it was added by mistake:
1. Remove the ingress rule in OCI Console → Networking → VCN → Security Lists
2. If UFW is active: `sudo ufw delete allow 7012/tcp`
3. Verify: `nmap -p 7012 <VM_PUBLIC_IP>` should show `filtered`

### Failed deployment and rollback verification

```bash
# On the VM, check what is currently running
docker compose -f /opt/shuvmarg/staging/docker-compose.yml ps
cat /opt/shuvmarg/staging/.env | grep BACKEND_IMAGE

# Verify rollback health
curl -fsS https://api-staging.shuvmarg.com/health
```
