# Stage 1: Build frontend and prune production dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies (leverages Docker layer cache when package*.json is unchanged)
COPY package*.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy source code without any local database artifacts
COPY . .
RUN rm -rf /app/data/*.sqlite* /app/dev-dist \
  && npm run build \
  && npm prune --omit=dev --legacy-peer-deps

# Stage 2: Minimal production runtime for VPS
FROM node:22-alpine AS runner

WORKDIR /app

# Install tzdata so TZ=Asia/Tehran works accurately for Shamsi dates & scheduled backups
RUN apk add --no-cache tzdata \
  && cp /usr/share/zoneinfo/Asia/Tehran /etc/localtime \
  && echo "Asia/Tehran" > /etc/timezone

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Tehran
ENV DATA_DIR=/app/data
ENV LEGACY_DATA_DIR=/app/legacy_data
ENV NODE_OPTIONS="--max-old-space-size=512"

# Copy only runtime artifacts (no source frontend, no devDependencies)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/utils/jalali.ts ./src/utils/jalali.ts

RUN mkdir -p /app/data/receipts /app/data/auto-backups /app/legacy_data

VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run tsx directly (no npm wrapper) so SIGTERM triggers graceful SQLite WAL shutdown
CMD ["node", "./node_modules/tsx/dist/cli.mjs", "server.ts"]
