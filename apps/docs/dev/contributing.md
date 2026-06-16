---
title: Contributing
---

# Contributing

We welcome contributions! Please follow these guidelines.

## Getting Started

1. Open an issue describing what you want to work on (unless it's a trivial fix)
2. Fork the repository
3. Create a feature branch
4. Make your changes
5. Submit a pull request

## Pull Request Guidelines

- Small, focused PRs are preferred over large monolithic changes
- Include tests for new features or bug fixes
- Update documentation if your change affects user-facing behavior

## Code Style

Follow these conventions across the codebase:

- **Files**: kebab-case for utilities/services, PascalCase for components
- **Functions**: camelCase
- **Classes/Interfaces**: PascalCase
- **Indentation**: 2 spaces
- **Quotes**: Double quotes (never single)
- **Semicolons**: Yes
- **Trailing commas**: ES5 style

## Testing

Run tests before submitting:

```bash
# Unit tests
pnpm test:unit

# Integration tests
pnpm test:integration

# All tests
pnpm test
```

## Type Checking

Ensure TypeScript types are correct:

```bash
pnpm typecheck
```

## Linting

Check code style:

```bash
pnpm lint
```

## Database Changes

::: warning
NEVER write migration files by hand. This breaks migration tracking.
:::

When modifying the database schema:

1. Edit schema files in `apps/backend/src/db/schema/`
2. Generate migrations: `pnpm --filter @branchforge/backend db:generate`
3. Review the generated migration in `apps/backend/src/db/migrations/`
4. Apply migrations: `pnpm --filter @branchforge/backend db:migrate`
