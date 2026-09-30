
# Wivae production image — builds the API server, dashboard SPA, and POS
# PWA into one image, matching the app's existing design where the Hono
# server itself serves all three (see server/src/index.ts's docblock on
# why the marketing site is deliberately the one thing NOT in here — it's
# fully static with zero server dependency and belongs on a CDN instead,
# see DEPLOY.md).
#
# Build order matters: `prisma generate` must run BEFORE `tsc`, because
# Prisma's client generator outputs real .ts source (not pre-built JS) into
# server/src/generated/prisma/ -- tsc only picks it up if it already exists
# when compilation runs.

# Pin to a specific minor for reproducible builds — `node:22-slim` would pull
# any 22.x patch on each build, making image hashes non-deterministic.
FROM node:22.16-slim AS builder
WORKDIR /app

# Install all workspace deps first (better layer caching -- this layer only
# rebuilds when a package.json/lockfile changes, not on every source edit).
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY marketing/package.json ./marketing/
RUN npm ci

# Prisma client generation only needs the schema + its own config, so this
# also gets its own cache-friendly layer.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# The dashboard bakes its workspace domain in at BUILD time (Vite env vars are
# compile-time, not read at runtime), so it must be known here. Set a service
# variable named VITE_TENANT_DOMAIN to your root domain (e.g. wivae.com) —
# Railway passes it in as this build argument. It must equal the runtime
# TENANT_DOMAIN. Unset, the dashboard falls back to wivae.com.
ARG VITE_TENANT_DOMAIN=
ENV VITE_TENANT_DOMAIN=$VITE_TENANT_DOMAIN

# Now the full source and the three builds this image actually needs.
COPY . .
RUN npm run build            # dashboard SPA -> public/
RUN npm run pos:build        # POS PWA -> public/pos/
RUN npm run server:build     # tsc: server/src -> server/dist

# ---------------------------------------------------------------------------

FROM node:22.16-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Run as a non-root user — defence in depth. Node doesn't need root for
# port 3000 (non-privileged port), and this limits the blast radius of any
# supply-chain or injection vulnerability in a dependency.
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --shell /bin/sh --create-home wivae

# node_modules must come from the builder stage, not a fresh install here --
# it already has the generated Prisma client's runtime deps resolved
# correctly relative to the custom output path.
COPY --from=builder --chown=wivae:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=wivae:nodejs /app/server/dist ./server/dist
COPY --from=builder --chown=wivae:nodejs /app/public ./public
COPY --from=builder --chown=wivae:nodejs /app/package.json ./package.json
COPY --from=builder --chown=wivae:nodejs /app/server/package.json ./server/package.json

USER wivae

EXPOSE 3000

# Health check: container orchestrators (Docker Swarm, Render, Railway) use
# this to determine when the container is ready for traffic and to detect
# a crashed-but-still-running process. Without it, a dead Node process that
# hasn't exited yet is treated as healthy and continues to receive traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server/dist/index.js"]

