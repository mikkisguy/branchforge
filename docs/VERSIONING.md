# BranchForge Version Numbering Implementation

This document describes the implementation of automatic version numbering for BranchForge.

## Architecture

BranchForge is a pnpm workspace monorepo with three packages:

- `@branchforge/frontend` (React/Vite app)
- `@branchforge/backend` (Fastify API)
- `@branchforge/shared` (TypeScript types used by both)

The project uses **unified versioning** with Changesets:

- All packages share the same version number
- Versions are bumped together via Changesets
- Docker images are tagged with semantic versions

### Version Correlation

```
Git Tag: v1.2.3
├── @branchforge/frontend: 1.2.3
├── @branchforge/backend: 1.2.3
└── @branchforge/shared: 1.2.3
```

### Docker Image Tags

Docker images are tagged with multiple formats:

- `branchforge/backend:1.2.3` (exact version)
- `branchforge/backend:1.2` (minor version, moves on patches)
- `branchforge/backend:1` (major version, moves on minors/patches)
- `branchforge/backend:latest` (latest stable)
- `branchforge/backend:abc123def` (git commit SHA for CI builds)

## Changesets Configuration

### File: `.changeset/config.json`

The Changesets config is set up with **fixed packages**:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [
    ["@branchforge/frontend", "@branchforge/backend", "@branchforge/shared"]
  ],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

The `fixed` array ensures all three packages always have the same version.

## Dockerfile Version Labels

### Backend Dockerfile

The backend Dockerfile includes version build arguments and labels:

```dockerfile
FROM node:20-alpine AS builder

ARG VERSION=0.0.1
ARG BUILD_DATE
ARG VCS_REF

# ... build steps ...

# Production image
FROM node:20-alpine

ARG VERSION=0.0.1
ARG BUILD_DATE
ARG VCS_REF

LABEL org.label-schema.name="BranchForge Backend"
LABEL org.label-schema.version=$VERSION
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.label-schema.vcs-ref=$VCS_REF

# ... rest of Dockerfile ...
```

### Frontend Dockerfile

The frontend Dockerfile follows the same pattern with nginx:

```dockerfile
FROM node:20-alpine AS builder

ARG VERSION=0.0.1
ARG BUILD_DATE
ARG VCS_REF

# ... build steps ...

FROM nginx:alpine

ARG VERSION=0.0.1
ARG BUILD_DATE
ARG VCS_REF

LABEL org.label-schema.name="BranchForge Frontend"
LABEL org.label-schema.version=$VERSION
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.label-schema.vcs-ref=$VCS_REF

# ... rest of Dockerfile ...
```

##  Pipeline

The   includes the following stages:

### Build Stage

Runs tests and builds artifacts on main and release branches:

```yaml
build:
  stage: build
  image: node:20-alpine
  before_script:
    - npm install -g pnpm@9
    - pnpm install --frozen-lockfile
  script:
    - pnpm build
    - pnpm test
  artifacts:
    paths:
      - apps/*/dist
      - packages/*/dist
    expire_in: 1 week
  only:
    - main
    - /^release\/.*$/
```

### Release Stage

Manual trigger that consumes changesets and creates version tags:

```yaml
release:
  stage: release
  image: node:20-alpine
  script:
    - |
      if [ $(pnpm changeset status --output=json | jq '.releases | length') -gt 0 ]; then
        pnpm changeset version
        VERSION=$(node -p "require('./package.json').version")
        git add .
        git commit -m "chore: version packages to v$VERSION"
        git tag "v$VERSION"
        git push origin main
        git push origin "v$VERSION"
      fi
  only:
    - main
  when: manual
```

### Deploy Stage

Builds and pushes Docker images with version tags when a git tag is created:

```yaml
docker:backend:
  stage: deploy
  image: docker:24
  services:
    - docker:24-dind
  script:
    - VERSION=$(node -p "require('./apps/backend/package.json').version")
    - |
      docker build \
        --build-arg VERSION=$VERSION \
        --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
        --build-arg VCS_REF=$CI_COMMIT_SHA \
        -t $CI_REGISTRY_IMAGE/backend:$VERSION \
        -t $CI_REGISTRY_IMAGE/backend:${VERSION%.*} \
        -t $CI_REGISTRY_IMAGE/backend:latest \
        -t $CI_REGISTRY_IMAGE/backend:$CI_COMMIT_SHORT_SHA \
        -f apps/backend/Dockerfile \
        .
    - docker push $CI_REGISTRY_IMAGE/backend:$VERSION
    - docker push $CI_REGISTRY_IMAGE/backend:${VERSION%.*}
    - docker push $CI_REGISTRY_IMAGE/backend:latest
    - docker push $CI_REGISTRY_IMAGE/backend:$CI_COMMIT_SHORT_SHA
  only:
    - tags
```

## NPM Scripts

The following scripts are available in the root `package.json`:

```json
{
  "changeset": "changeset",
  "changeset:version": "changeset version",
  "changeset:publish": "changeset publish",
  "version": "changeset version && pnpm install --lockfile-only",
  "release": "pnpm build && changeset publish"
}
```

## Version Bump Guidelines

| Type      | Example       | When to Use                                      |
| --------- | ------------- | ------------------------------------------------ |
| **major** | 1.0.0 → 2.0.0 | Breaking API changes, DB schema migrations       |
| **minor** | 1.0.0 → 1.1.0 | New features, backward-compatible additions      |
| **patch** | 1.0.0 → 1.0.1 | Bug fixes, UI improvements, non-breaking changes |

## Changelog

Changesets automatically generates `CHANGELOG.md` in the root directory. When you run `pnpm changeset version`:

1. All pending changeset files are consumed (removed from `.changeset/` directory)
2. Package versions are bumped
3. `CHANGELOG.md` is updated with:
   - Version number as heading (## 1.2.3)
   - Date of release
   - Grouped changes by type (major, minor, patch)
   - Summaries from each changeset

Example `CHANGELOG.md` output:

```markdown
# BranchForge Changelog

## 1.2.3

### Minor Changes

- abc123: Add new visual novel editing features
- def456: Implement user authentication

### Patch Changes

- ghi789: Fix memory leak in backend worker

## 1.2.2

### Patch Changes

- jkl012: Fix navigation bug in Storybook editor
```

## Verification Commands

### Test Version Synchronization

```bash
# After changeset version, verify all packages match
node -p "require('./package.json').version"           # root
node -p "require('./apps/frontend/package.json').version"
node -p "require('./apps/backend/package.json').version"
node -p "require('./packages/shared/package.json').version"
```

### Verify Docker Labels

```bash
docker inspect branchforge/backend:1.2.3 | grep label-schema.version
```

### Test Local Release Cycle

```bash
pnpm changeset  # create a test changeset
pnpm changeset version
# Verify versions updated
```

### Check Git Tags

```bash
git tag -l
git show v1.0.0  # should show version commits
```
