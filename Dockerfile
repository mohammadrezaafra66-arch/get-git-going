# syntax=docker/dockerfile:1.7

# ====== Build stage ======
FROM oven/bun:1-debian AS builder
WORKDIR /app

COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

# Public client-safe build args (baked into client bundle)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    NODE_ENV=production \
    SELF_HOST_NODE=1

RUN bun run build

# Security guard: ensure no server-only secrets leaked into the client bundle.
RUN set -e; \
    if [ -d "dist/client" ]; then \
      if grep -REIn --binary-files=without-match \
          -e 'SERVICE_ROLE' -e 'SUPABASE_SERVICE_ROLE_KEY' \
          -e 'JWT_SECRET' -e 'POSTGRES_PASSWORD' -e 'LOVABLE_API_KEY' \
          dist/client; then \
        echo "FATAL: secret-like token found in client bundle" >&2; exit 1; \
      fi; \
    fi

# ====== Runtime stage (Node SSR) ======
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

RUN apk add --no-cache wget tini \
 && addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/server ./server
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/node-entry.mjs"]