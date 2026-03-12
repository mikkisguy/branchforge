# BranchForge Release Workflow

This document describes the versioning and release process for BranchForge.

## Overview

BranchForge uses **Changesets** for version management with a **unified versioning** approach:

- All packages share the same version number (e.g., `v1.2.3`)
- A single git tag represents a release of the entire application
- Docker images are tagged with semantic versions

## Version Number Format

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR.MINOR.PATCH** (e.g., `1.2.3`)
- **Major**: Breaking changes (API changes, DB migrations)
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes (non-breaking)

## Daily Development

### 1. Creating a Feature Branch

```bash
git checkout -b feature/my-feature
```

### 2. Making Changes

Edit code as needed. The codebase has three packages:

- **`@branchforge/frontend`** (apps/frontend) - The UI application
- **`@branchforge/backend`** (apps/backend) - The API server
- **`@branchforge/shared`** (packages/shared) - Shared types and utilities

Note which packages your changes touch. This matters when creating your changeset.

### 3. Creating a Changeset

```bash
pnpm changeset
```

You'll be prompted:

1. **Select packages**: Choose all packages affected (usually all three)
2. **Bump type**: Choose `major`, `minor`, or `patch`
3. **Summary**: Write a brief description of changes

This creates a `.changeset/{unique-id}.md` file.

### 4. Commit and Push

```bash
git add .
git commit -m "feat: add my feature"
git push origin feature/my-feature
```

### 5. Create Merge Request

Create a merge request in GitLab. The CI will run tests.

## Releasing

### Option A: Via  (Recommended)

1. Merge your feature branch to `main`
2. Go to GitLab → CI/CD → Pipelines
3. Find the  for main branch
4. Click the play button on the `release` stage
5.  will:
   - Consume all changesets
   - Bump all package versions
   - Create a git tag (e.g., `v1.2.3`)
   - Trigger Docker builds

### Option B: Manual Release

```bash
# 1. Checkout main and pull
git checkout main
git pull origin main

# 2. Consume changesets and bump versions
pnpm changeset version

# 3. Review the changes
git status
git diff

# 4. Commit version bump
git add .
git commit -m "chore: version packages to v1.2.3"

# 5. Create and push tag
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"
git push origin main
git push origin "v$VERSION"
```

## Deployment

### Development

```bash
docker-compose pull
docker-compose up -d
```

### Production with Specific Version

```bash
# Create .env file
cat > .env << EOF
BACKEND_VERSION=1.2.3
FRONTEND_VERSION=1.2.3
POSTGRES_USER=branchforge
POSTGRES_PASSWORD=your-password
POSTGRES_DB=branchforge
EOF

# Deploy
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

## Hotfix Procedure

For urgent fixes to production:

```bash
# 1. Checkout the tag to fix
git checkout v1.2.3
git checkout -b hotfix/critical-bug

# 2. Make the fix
# ... edit code ...

# 3. Create changeset (patch)
pnpm changeset

# 4. Commit and push
git add .
git commit -m "fix: critical bug"
git push origin hotfix/critical-bug

# 5. Merge to main and release
git checkout main
git merge hotfix/critical-bug
pnpm changeset version
git add .
git commit -m "chore: version packages (hotfix)"
git push

# 6. Tag hotfix
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"
git push origin "v$VERSION"
```

## Pre-releases

For alpha, beta, or RC versions:

```bash
# Enter pre-release mode
pnpm changeset pre enter beta

# Create changesets as normal
pnpm changeset

# When ready to exit pre-release
pnpm changeset pre exit

# This creates versions like: 1.0.0-beta.1, 1.0.0-beta.2, etc.
```

## Checking Versions

### Current Package Versions

```bash
# All at once
node -p "require('./package.json').version"                    # root
node -p "require('./apps/frontend/package.json').version"      # frontend
node -p "require('./apps/backend/package.json').version"       # backend
node -p "require('./packages/shared/package.json').version"    # shared
```

### Docker Image Versions

```bash
docker inspect branchforge/backend:latest --format '{{index .Config.Labels "org.label-schema.version"}}'
docker inspect branchforge/frontend:latest --format '{{index .Config.Labels "org.label-schema.version"}}'
```

### Pending Changesets

```bash
pnpm changeset status
```

### Git Tags

```bash
git tag -l
git show v1.2.3  # View tag details
```

## Troubleshooting

### Versions are out of sync

If package versions don't match:

```bash
# Manually set all to same version
VERSION="1.2.3"
npm version $VERSION -w apps/frontend
npm version $VERSION -w apps/backend
npm version $VERSION -w packages/shared
npm version $VERSION
```

### Changeset not consumed

If a changeset wasn't consumed:

```bash
# Check pending changesets
pnpm changeset status

# Manually consume
pnpm changeset version
```

### Docker build fails

Check build args are passed:

```bash
docker build \
  --build-arg VERSION=1.2.3 \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse HEAD) \
  -t test/backend:1.2.3 \
  -f apps/backend/Dockerfile \
  .
```

## Additional Resources

- [Changesets Documentation](https://github.com/changesets/changesets)
- [Semantic Versioning](https://semver.org/)
- [ Documentation](https://docs.gitlab.com/ee/ci/)
