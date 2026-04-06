# Contributing to BranchForge

Thank you for your interest in contributing to BranchForge!

## Contribution Philosophy

BranchForge is maintained primarily by the main developer. While it's open source, the goal is to keep the project manageable and focused.

**What's welcome:**

- Bug fixes and small improvements
- Documentation updates
- Minor feature enhancements that align with the project vision
- Bug reports and well-defined feature requests
- Testing and quality improvements

**What requires discussion first:**

- Large features or new functionality
- Architectural changes
- Changes to core systems (database schema, major workflows)
- UI/UX redesigns
- Anything that significantly expands scope

## Getting Started

### Before Starting Work

1. **Check existing issues** - Someone else might be working on it
2. **Open an issue first** - Even for small fixes, create or comment on an issue to discuss
3. **Wait for approval** - The maintainer will review and approve work before you invest time
4. **Start small** - If you're new to the project, begin with documentation or small bug fixes

### Reporting Issues

When reporting bugs or requesting features:

- Use the issue templates if available
- Be specific and detailed
- Include reproduction steps for bugs
- Explain the use case for feature requests
- Check if it aligns with the project's vision

## Development Workflow

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- PostgreSQL 14+

### Setup

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/yourusername/branchforge.git
   cd branchforge
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. Set up the database:

   ```bash
   pnpm --filter @branchforge/backend db:migrate
   ```

6. Start development servers:
   ```bash
   pnpm dev
   ```

### Branching

Create a branch for your work:

```bash
git checkout -b fix/issue-description
# or
git checkout -b feature/small-feature-name
```

Keep branches focused on a single issue or small feature.

## Guidelines

### Code Changes

**Small Changes (Bug fixes, minor improvements):**

- Follow existing code style and patterns
- Keep changes minimal and focused
- Test thoroughly
- Update tests if needed

**Larger Changes:**

- Must have prior approval via issue discussion
- Break into smaller, reviewable chunks if possible
- Document changes clearly
- Consider backwards compatibility

### Coding Standards

For detailed code style guidelines, import conventions, testing patterns, and specific backend/frontend rules, see [AGENTS.md](./AGENTS.md).

- Use TypeScript for type safety
- Follow existing code patterns and conventions
- Run linting and formatting before committing:
  ```bash
  pnpm lint
  pnpm format
  ```
- Run type checking:
  ```bash
  pnpm typecheck
  ```
- Keep functions and components small and focused

### Testing

- Write tests for new functionality
- Run all tests before committing:
  ```bash
  pnpm test
  ```
- Ensure all existing tests still pass
- Focus on critical paths and edge cases

### Commit Messages

Use clear, descriptive commit messages:

```
fix: resolve GitLab sync conflict with concurrent uploads
docs: update CONTRIBUTING with new guidelines
style: format code with prettier
refactor: simplify state management in labels service
test: add unit tests for character detection
chore: update dependencies to latest versions
```

### Pull Requests

#### Before Submitting

- Ensure your code is formatted (`pnpm format`)
- Run linting (`pnpm lint`)
- Run type checking (`pnpm typecheck`)
- Run tests (`pnpm test`)
- Update documentation if needed
- Keep PRs small and focused

#### PR Description

Include in your PR:

- **Title**: Clear and concise
- **Related Issue**: Link to the issue number
- **Description**: What changes were made and why
- **Type**: bugfix / enhancement / docs / refactor / test / chore
- **Testing**: How you tested your changes
- **Breaking Changes**: Any backwards-incompatible changes (should be discussed first)
- **Screenshots**: For UI changes (if applicable)

#### Review Process

1. Automated checks (lint, typecheck, tests) must pass
2. Maintainer review and approval required
3. Address all review feedback
4. Maintainer merges after approval

**Note**: The maintainer has final discretion over what gets merged and when.

## Project Structure & Architecture

```
branchforge/
├── apps/
│   ├── backend/          # Fastify API server
│   │   ├── src/
│   │   │   ├── routes/   # API route handlers
│   │   │   ├── services/  # Business logic
│   │   │   └── db/       # Database schema and migrations
│   └── frontend/         # React application
│       ├── src/
│       │   ├── components/  # React components
│       │   ├── pages/       # Page components
│       │   ├── hooks/       # Custom hooks
│       │   └── api/         # API clients
├── packages/
│   └── shared/           # Shared types and utilities
├── docs/                 # Documentation
├── CONTRIBUTING.md       # This file
└── README.md
```

### Architecture Principles

- **Separation of Concerns**: Clear separation between routes, services, and UI
- **Type Safety**: Use TypeScript across the codebase
- **Consistency**: Follow existing patterns when adding new code
- **Simplicity**: Prefer simple solutions over complex ones

### Database Changes

**Important**: Database schema changes are significant and require maintainer approval.

1. Modify schema in `apps/backend/src/db/schema.ts`
2. Generate migration:
   ```bash
   pnpm --filter @branchforge/backend db:generate
   ```
3. Review and test migration
4. Get approval before running:
   ```bash
   pnpm --filter @branchforge/backend db:migrate
   ```

## Design Philosophy

BranchForge is built to be:

- **Inspiring**: Encourage creativity and flow
- **Gentle**: Approachable, calm, never overwhelming
- **Efficient**: Respect of writer's time
- **Polished**: Every detail considered

When contributing, keep these principles in mind. For more on design context, see `.impeccable.md`.

## Feature Development

### Adding a New Feature

1. **Discuss first**: Open an issue describing the feature
2. **Get approval**: Wait for maintainer approval before starting
3. **Follow patterns**: Look at similar existing features
4. **Keep it small**: Break into smaller PRs if possible
5. **Document**: Update relevant documentation

### Roadmap Alignment

Check [docs/FEATURE_ROADMAP.md](docs/FEATURE_ROADMAP.md) to see if the feature is:

- Already implemented
- In progress
- Planned
- Out of scope

## Questions?

- Check existing issues and discussions
- Create an issue with your question
- Be patient - this is a side project

## Code of Conduct

Be respectful and constructive. Remember that:

- This is a volunteer project
- The maintainer works on this in their free time
- Small, focused contributions are most helpful
- Your time and effort is appreciated

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (GPL v3.0).

---

Thank you for considering contributing to BranchForge! Small, thoughtful contributions help make this project better while keeping it manageable for the maintainer.
