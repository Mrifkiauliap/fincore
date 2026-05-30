# Stage 1: Prune the workspace for the specific app
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Install turbo globally to prune
RUN npm install -g turbo
COPY . .
# Generate a partial monorepo with a pruned lockfile for a target workspace.
RUN turbo prune --scope=@fincore/api --docker

# Stage 2: Install dependencies and build
FROM node:22-alpine AS installer
RUN apk add --no-cache libc6-compat python3 make g++ vips-dev
WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# First install dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Build the project
COPY --from=builder /app/out/full/ .
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/turbo.json ./turbo.json
RUN pnpm turbo run build --filter=@fincore/api...

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

# Install curl for healthcheck if needed, and pnpm to run scripts
RUN apk add --no-cache curl && corepack enable pnpm

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs-api
USER nestjs-api

# Copy over the built artifacts and dependencies
COPY --from=installer --chown=nestjs-api:nodejs /app .

# Expose port (adjust if API uses a different port)
EXPOSE 3000

# Start the application
CMD ["node", "apps/api/dist/main.js"]
