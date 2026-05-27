# Stage 1: Prune the workspace for the specific app
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Install turbo globally to prune
RUN npm install -g turbo
COPY . .
# Generate a partial monorepo with a pruned lockfile for a target workspace.
RUN turbo prune --scope=@fincore/sender --docker

# Stage 2: Install dependencies and build
FROM node:22-alpine AS installer
RUN apk add --no-cache libc6-compat
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
RUN pnpm turbo run build --filter=@fincore/sender...

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

RUN corepack enable pnpm

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs-sender
USER nestjs-sender

# Copy over the built artifacts and dependencies
COPY --from=installer --chown=nestjs-sender:nodejs /app .

# Start the application
CMD ["node", "apps/sender/dist/main.js"]
