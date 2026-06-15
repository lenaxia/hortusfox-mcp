# ──────────────────────────────────────────────────────────────────────
# hortusfox-mcp — Docker image
#
# Multi-stage build: compiles TypeScript in a builder stage, then copies
# only the production output + node_modules into a slim Node runtime that
# also has supergateway installed.
#
# The resulting image is designed to be wrapped by supergateway so that
# the stdio MCP server is exposed as a Streamable HTTP endpoint on :8000.
# The K8s HelmRelease supplies the `supergateway` command + args
# (--outputTransport streamableHttp) to support multiple concurrent clients.
# ──────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Install supergateway globally so it's on PATH for the K8s command.
RUN npm install -g supergateway@3.4.3

# Install only production dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder.
COPY --from=builder /app/dist ./dist

# Non-root user for security.
RUN addgroup -g 568 app && adduser -D -u 568 -G app app
USER app

EXPOSE 8000
