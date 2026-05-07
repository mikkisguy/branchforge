# ADR-0002: Session vs JWT Authentication

**Status:** Accepted

**Date:** 2025-05-07

## Context

When choosing an authentication strategy for BranchForge, the main options were:

1. **JWT (JSON Web Tokens)** — Stateless tokens stored client-side, sent with each request
2. **Session-based auth** — Server-side session storage with session ID in HTTP-only cookie

Considerations:

- Expected user scale: Unknown (currently 0 users, solo developer)
- Simplicity vs complexity
- Security implications
- Operational concerns (revocation, scaling)

## Decision

Use **database-backed session storage** with HTTP-only cookies.

### Implementation

- **Session store:** Custom `DrizzleSessionStore` using PostgreSQL (via Drizzle ORM)
- **Cookie:** HTTP-only, secure flag in production
- **Session data:** User object (id, email, role) stored in `user_sessions` table
- **Cleanup:** Automatic expired session removal every hour
- **Resilience:** Retry logic with exponential backoff, dead-letter queue for failed operations

```typescript
// Session middleware checks for valid user in session
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.session?.user) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  request.user = request.session.user;
}
```

## Consequences

### Positive

- **Simplicity** — No refresh token logic, no token rotation, no JWT validation overhead
- **Immediate revocation** — Delete session row to invalidate; no token blacklist needed
- **Security** — HTTP-only cookies protected from XSS, database storage prevents client-side tampering
- **Session survival** — Sessions persist across server restarts (not in-memory)
- **Horizontal scaling ready** — Multiple servers can share the same session database

### Negative

- **Database lookup on every request** — Adds latency vs stateless JWT (mitigated by connection pooling)
- **Session storage overhead** — Requires `user_sessions` table and cleanup job
- **Single point of failure** — If session database is unavailable, auth fails (mitigated by retry logic with dead-letter queue)
- **Scaling consideration** — Very high request volumes may require Redis for session storage

### Why not JWT?

| JWT drawback                            | Session advantage                   |
| --------------------------------------- | ----------------------------------- |
| Revocation requires token blacklist     | Immediate revocation via DELETE     |
| Refresh tokens add complexity           | Single session ID, simple lifecycle |
| Token validation logic on every request | Cookie lookup handled by Fastify    |
| Large token size with claims            | Small session ID                    |
| Compromised token valid until expiry    | Server controls session lifetime    |

JWT would be appropriate if:

- Stateless auth was required (multiple independent services)
- Token revocation wasn't a concern
- External services needed to validate tokens without database access

None of these apply to BranchForge's architecture.

### Future considerations

If the application scales to high traffic volumes:

1. **Add Redis** for session storage cache (keep PostgreSQL as source of truth)
2. **Session stickiness** — Not required with shared session database
3. **Connection pooling** — Already handled by Drizzle/pg

## References

- Implementation: `apps/backend/src/services/session-store.service.ts`
- Middleware: `apps/backend/src/middleware/auth.middleware.ts`
- Schema: `apps/backend/src/db/schema/tables/sessions.ts`
- Tests: `apps/backend/src/services/__tests__/auth.service.*.test.ts`
