# ──────────────────────────────────────────────────────────────────────
# hortusfox-mcp — Docker image
#
# Multi-stage build: compiles TypeScript in a builder stage, then copies
# only the production output + node_modules into a slim Node runtime.
#
# The server selects its transport via the HORTUSFOX_TRANSPORT env var:
#   stdio (default) — for local MCP clients (Claude Desktop, etc.)
#   http             — exposes a Streamable HTTP MCP endpoint on
#                      HORTUSFOX_HTTP_PORT (default 8000) at /mcp
#                      with a /healthz liveness probe endpoint.
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

# Install only production dependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder.
COPY --from=builder /app/dist ./dist

# Non-root user for security.
RUN addgroup -g 568 app && adduser -D -u 568 -G app app
USER app

EXPOSE 8000

CMD ["node", "dist/index.js"]
