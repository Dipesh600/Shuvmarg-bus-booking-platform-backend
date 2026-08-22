# ── Shuvmarg Backend — Production Dockerfile ────────────────────────────────
#
# Base: node:20-slim (Debian Bookworm slim)
# Reason: 'sharp' requires libvips native binaries (glibc required).
#         Alpine is NOT compatible with the bundled libvips in sharp.
#
# Health check: Node.js built-in fetch (Node 18+) — curl is not present
# in node:20-slim and must not be assumed.

FROM node:22-slim

# Create working directory owned by the built-in non-root 'node' user
WORKDIR /app

# ── Install dependencies ──────────────────────────────────────────────────────
# Copy lock files first to maximise Docker layer cache hits.
COPY package.json package-lock.json ./

# Production dependencies only. Keep optional dependencies because native
# packages such as sharp select their ARM64 runtime binary through them.
RUN npm ci --omit=dev --ignore-scripts=false \
 && npm cache clean --force

# ── Copy application source ───────────────────────────────────────────────────
# .dockerignore excludes: .git, .github, node_modules, logs, tests, docs,
#   .env*, coverage, scratch, debug files, dummy assets, schema docs.
COPY --chown=node:node . .

# ── Runtime configuration ─────────────────────────────────────────────────────
ENV NODE_ENV=production \
    PORT=7012

EXPOSE 7012

# Switch to non-root user for runtime
USER node

# ── Health check (Node built-in fetch, no curl required) ─────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7012/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
