# ====== Build stage ======
FROM oven/bun:1-debian AS builder
WORKDIR /app

# --- Self-host / LAN registry hardening ---------------------------------
# Repo lockfile may contain resolved URLs pointing to Lovable's private
# npm cache (europe-west1-npm.pkg.dev / lovable-core-prod / sandbox-npm-cache),
# which returns HTTP 403 for callers outside Lovable. For LAN/self-host
# builds we always install from the public npm registry.
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    npm_config_registry=https://registry.npmjs.org/ \
    BUN_CONFIG_REGISTRY=https://registry.npmjs.org/

COPY package.json ./
# Drop any inherited registry config that could redirect installs to a
# private cache, then resolve fresh against public npm. We intentionally
# do NOT copy bun.lock* here, because Bun honors the resolved URLs in the
# lockfile and would otherwise re-fetch from the private cache.
RUN rm -f .npmrc .yarnrc .yarnrc.yml .bunfig.toml bunfig.toml || true \
 && bun install

COPY . .
# Re-apply the registry-clean state after `COPY . .` brings repo files back in,
# so subsequent tooling cannot reach the private cache either.
RUN rm -f .npmrc .yarnrc .yarnrc.yml .bunfig.toml bunfig.toml || true

# Public client-safe build args (baked into client bundle)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
# Environment identity for the client bundle. Without VITE_APP_ENV the bundle
# falls back to Vite's MODE, which is always "production" for a real build; the
# environment safety banner then treats every LAN address as a test address and
# shows a red warning even on the production server. VITE_TRUSTED_HOSTS lists
# the hostnames that deployment is legitimately served from.
ARG VITE_APP_ENV
ARG VITE_TRUSTED_HOSTS
# Feature flags. Vite inlines VITE_* at BUILD time, so a flag must arrive as an ARG here and be
# exported as ENV below, or the compose build arg is silently dropped and the key never reaches
# the bundle — which is exactly what happened on 2026-09-02.
ARG VITE_FEATURE_QUOTE_CUSTOMER_PICKER
ARG VITE_FEATURE_QUOTE_IDENTITY_FROM_RECORD
# Build identity. Also declared in the runtime stage below (a Dockerfile ARG is
# scoped to one stage), but needed HERE too: vite.config.ts reads GIT_SHA and
# BUILD_TIME at build time to derive the service worker's version, which is what
# makes a deployed client notice a new build. Non-secret, already surfaced by
# GET /api/version.
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_APP_ENV=$VITE_APP_ENV \
    VITE_TRUSTED_HOSTS=$VITE_TRUSTED_HOSTS \
    VITE_FEATURE_QUOTE_CUSTOMER_PICKER=$VITE_FEATURE_QUOTE_CUSTOMER_PICKER \
    VITE_FEATURE_QUOTE_IDENTITY_FROM_RECORD=$VITE_FEATURE_QUOTE_IDENTITY_FROM_RECORD \
    GIT_SHA=$GIT_SHA \
    BUILD_TIME=$BUILD_TIME \
    NODE_ENV=production \
    SELF_HOST_NODE=1 \
    NITRO_PRESET=node-server \
    DISABLE_LOVABLE_MCP=1

RUN bun run build

# Security guard: ensure no server-only secrets leaked into the client bundle.
RUN set -e; \
    if [ -d ".output/public" ]; then \
      if grep -REIn --binary-files=without-match \
          -e 'SERVICE_ROLE' -e 'SUPABASE_SERVICE_ROLE_KEY' \
          -e 'JWT_SECRET' -e 'POSTGRES_PASSWORD' -e 'LOVABLE_API_KEY' \
          .output/public; then \
        echo "FATAL: secret-like token found in client bundle" >&2; exit 1; \
      fi; \
    fi

# ====== Runtime stage (Node SSR) ======
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Build metadata (set via `docker build --build-arg ...`).
# These are non-secret runtime values surfaced by GET /api/version.
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG APP_ENV=unknown
ENV APP_GIT_SHA=$GIT_SHA \
    APP_BUILD_TIME=$BUILD_TIME \
    APP_ENV=$APP_ENV

RUN apk add --no-cache wget tini \
 && addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/.output ./.output
COPY --from=builder --chown=app:app /app/package.json ./package.json
# LAN/self-host: ship node_modules so the SSR bundle can resolve runtime
# packages like `h3-v2` that are not pre-bundled by the Vite Node build.
# Image gets bigger; acceptable for self-host pilots.
COPY --from=builder --chown=app:app /app/node_modules ./node_modules

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", ".output/server/index.mjs"]
