# One image for both processes. ROLE=app (default) runs the API, which also serves
# the built SPA; ROLE=worker runs the worker. Both listen on $PORT (8080) and expose
# /healthz and /readyz. Runs as UID 1000 (non-root).

# --- build: install everything, build web, api and worker ---
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm run build

# --- deps: production dependencies only ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# --- runtime ---
FROM node:22-alpine
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=8080 ROLE=app APP_VERSION=$APP_VERSION
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /src/apps/api/package.json ./apps/api/package.json
COPY --from=build /src/apps/api/dist ./apps/api/dist
COPY --from=build /src/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /src/apps/worker/dist ./apps/worker/dist
COPY --from=build /src/apps/web/dist ./apps/web/dist
# The node image's "node" user, by number so runAsNonRoot can check it.
USER 1000
EXPOSE 8080
CMD ["sh", "-c", "if [ \"$ROLE\" = worker ]; then exec node --enable-source-maps apps/worker/dist/main.js; else exec node --enable-source-maps apps/api/dist/main.js; fi"]
