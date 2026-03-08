FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install git + curl (needed at build/runtime)
RUN apk add --no-cache git curl

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

# Build arg for Next.js (must be set at build time)
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build web app
RUN bun run --filter @highway/web build

# The API runs via Bun directly (no build step needed)

EXPOSE 4000 3000

# Start script runs both API and serves Next.js
CMD ["bun", "run", "start:prod"]
