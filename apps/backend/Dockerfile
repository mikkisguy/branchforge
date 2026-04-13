FROM node:24-alpine AS builder

ARG VERSION=0.0.1
ARG BUILD_DATE
ARG VCS_REF

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY scripts ./scripts
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Build backend
WORKDIR /app/apps/backend
RUN pnpm build

# Production image
FROM node:24-alpine

ARG VERSION=0.0.1
ARG BUILD_DATE
ARG VCS_REF

LABEL org.label-schema.name="BranchForge Backend"
LABEL org.label-schema.version=$VERSION
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.label-schema.vcs-ref=$VCS_REF

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files for production runtime
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY scripts ./scripts
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Copy built artifacts from builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const basePath = (process.env.BASE_PATH || '/api').replace(/\/$/, ''); require('http').get('http://localhost:3000' + basePath + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "apps/backend/dist/index.js"]
