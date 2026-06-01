# Stage 1: Prune the workspace for the specific app
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Install turbo globally to prune
RUN npm install -g turbo
COPY . .
# Generate a partial monorepo with a pruned lockfile for a target workspace.
RUN turbo prune --scope=@fincore/dashboard --docker

# Stage 2: Install dependencies and build
FROM node:22-alpine AS installer
RUN apk add --no-cache libc6-compat python3 make g++ vips-dev
WORKDIR /app

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
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

# Skip Zod validation during Docker build since runtime secrets aren't available yet
ENV SKIP_ENV_VALIDATION="1"

RUN pnpm turbo run build --filter=@fincore/dashboard...

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs-dashboard
USER nextjs-dashboard

COPY --from=installer /app/apps/dashboard/next.config.ts .
COPY --from=installer /app/apps/dashboard/package.json .

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs-dashboard:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=installer --chown=nextjs-dashboard:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=installer --chown=nextjs-dashboard:nodejs /app/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "apps/dashboard/server.js"]
