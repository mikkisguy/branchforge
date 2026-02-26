FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
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
FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace files and production dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Build shared package
WORKDIR /app/packages/shared
RUN pnpm build

# Build backend
WORKDIR /app/apps/backend
RUN pnpm build

EXPOSE 3000

CMD ["node", "dist/index.js"]
