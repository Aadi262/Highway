FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install git + railpack + curl (needed at build/runtime)
RUN apk add --no-cache git curl

# Install Railpack
RUN curl -fsSL https://railpack.sh/install.sh | sh

# Copy package files
COPY package.json turbo.json bun.lockb* ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/ ./apps/

# Build web app
RUN bun run --filter @highway/web build

# The API runs via Bun directly (no build step needed)

EXPOSE 4000 3000

# Start script runs both API and serves Next.js
CMD ["bun", "run", "start:prod"]
