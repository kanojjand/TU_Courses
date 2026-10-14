# TU Online — сборка для своего сервера (Docker Compose, см. docs/SERVER.md)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_MAX_UPLOAD_MB=200
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_MAX_UPLOAD_MB=${NEXT_PUBLIC_MAX_UPLOAD_MB}
RUN npm run build

# Веб-приложение: самодостаточный server.js без node_modules целиком
FROM node:22-alpine AS app
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S tu && adduser -S tu -G tu
COPY --from=build --chown=tu:tu /app/.next/standalone ./
COPY --from=build --chown=tu:tu /app/.next/static ./.next/static
COPY --from=build --chown=tu:tu /app/public ./public
USER tu
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]

# Фоновые задачи (pg-boss) и миграции
FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npx", "tsx", "scripts/worker.ts"]
