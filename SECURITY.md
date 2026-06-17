# Security Policy

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Email details privately to **branchforgereporting.clang219@passmail.net**. Please include a description, steps to reproduce, and the affected version.

## Security Best Practices for Deployments

When deploying BranchForge in production:

1. Use strong, random `SESSION_SECRET` (at least 32 characters)
2. Set `ENCRYPTION_KEY` for secure GitLab PAT storage (32-byte hex string)
3. Use HTTPS in production
4. Keep Node.js and PostgreSQL updated
5. Restrict database access to application user only
6. Regularly update dependencies: `pnpm update`

## Known Security Considerations

- **Session tokens**: HTTP-only cookies (`secure` + `SameSite=Lax` in production); configurable lifetime via `SESSION_MAX_AGE` (default 24h, clamped to 1h–30d) with sliding expiry (rolling sessions), so the value acts as an inactivity timeout
- **Password storage**: Hashed with bcrypt (see package.json for version; work factor: 10+)
- **API rate limiting**: Configurable via rate-limiter service
- **Database**: Uses parameterized queries via Drizzle ORM (SQL injection protection)
- **File uploads**: Limited by file type and size (e.g., avatars: 500KB, images only)

Thanks for helping keep BranchForge secure! ❤️
