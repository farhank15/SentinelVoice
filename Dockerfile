# ==============================================================================
# SentinelVoice - Multi-Stage Production Dockerfile for Render
# ==============================================================================

# Stage 1: Build Frontend React SPA
FROM oven/bun:1-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/bun.lock* ./
RUN bun install

COPY frontend/ ./
RUN bun run build

# Stage 2: Production Unified Server
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Install backend dependencies
COPY backend/package.json backend/bun.lock* ./backend/
WORKDIR /app/backend
RUN bun install --production

# Copy backend source code
COPY backend/ ./

# Copy built frontend assets to where Fastify static resolution finds it
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Ensure SQLite data directory exists
RUN mkdir -p src/data

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:' + (process.env.PORT || 8000) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "src/server.js"]
