# Deployment Guide

This guide covers deploying BranchForge to production.

## Prerequisites

- Docker and Docker Compose installed
- A domain name (optional, for production)
- SSL certificate (recommended for production)
- PostgreSQL 14+ database

## Quick Start (Docker Compose)

1. **Clone the repository:**

   ```bash
   git clone https://github.com/mikkisguy/branchforge.git
   cd branchforge
   ```

2. **Configure environment:**

   ```bash
   cp .env.example .env
   # Edit .env with your production values
   mkdir -p uploads
   sudo chown 1001:1001 uploads
   ```

3. **Start services:**

   ```bash
   docker compose pull
   docker compose up -d
   ```

   Compose first runs the one-shot `migrate` service. On a fresh deployment,
   the backend starts only after all pending migrations succeed. During an
   upgrade, an existing backend can remain available, but Compose will not
   replace it with the new image unless the migration succeeds.

4. **Access your application:**
   - Frontend: http://localhost
   - Backend: http://localhost:3000

## Production Configuration

### Environment Variables

Update `.env` for production:

```bash
# Docker Compose database
# POSTGRES_PASSWORD must contain only URI-safe characters (letters, digits,
# - _ . ~) unless you also set the percent-encoded variant used to build
# DATABASE_URL — see "Database URI password encoding".
POSTGRES_USER=branchforge
POSTGRES_PASSWORD=generate-strong-password
POSTGRES_DB=branchforge
PGPORT=5432

# Optional: how long a deploy waits for another migration job (default: 60000)
DB_MIGRATION_LOCK_TIMEOUT_MS=60000

# Server
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
BASE_PATH=/api/

# Session Auth (CRITICAL: Change these!)
SESSION_SECRET=generate-a-long-random-string-at-least-32-chars
# Optional. Session maxAge in milliseconds (default: 86400000 = 24h,
# clamped to 3600000–2592000000 = 1h–30d). With sliding expiry enabled,
# this is the inactivity timeout, not a fixed-from-login cap.
# SESSION_MAX_AGE=86400000

# Encryption key for GitLab PAT (CRITICAL: Generate with Node.js)
ENCRYPTION_KEY=generate-with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Frontend Configuration
VITE_FRONTEND_BASE_URL=https://yourdomain.com
VITE_API_BASE_URL=/api
VITE_BACKEND_API_URL=https://yourdomain.com
VITE_ALLOWED_HOSTS=.yourdomain.com
```

### Generate Secure Keys

**Session Secret:**

```bash
# Generate a random 64-character string
openssl rand -base64 48
```

**Encryption Key (for GitLab PAT):**

```bash
# Generate a 32-byte hex string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Docker Compose Configuration

The default `docker-compose.yml` uses the published backend image for both the
one-shot migration job and the application. Its relevant dependency chain is:

```yaml
services:
  postgres:
    image: postgres:18-alpine
    environment:
      # The postgres container receives the RAW password. Never pre-encode it
      # here — the server needs the literal characters to authenticate.
      POSTGRES_USER: ${POSTGRES_USER:-branchforge}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-branchforge}
      POSTGRES_DB: ${POSTGRES_DB:-branchforge}
    volumes:
      # postgres:18 changed the data directory layout: PGDATA now lives in a
      # versioned subdirectory (e.g. /var/lib/postgresql/18/docker) instead of
      # /var/lib/postgresql/data, so the named volume mounts at the parent.
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -h 127.0.0.1 -U ${POSTGRES_USER:-branchforge} -d ${POSTGRES_DB:-branchforge}",
        ]

  migrate:
    image: ghcr.io/mikkisguy/branchforge-backend:${IMAGE_TAG:-beta}
    command: ["node", "apps/backend/dist/db/migrate.js"]
    environment:
      # URI-composed credentials must be percent-encoded — see
      # "Database URI password encoding" below.
      DATABASE_URL: postgresql://${POSTGRES_USER:-branchforge}:${POSTGRES_PASSWORD_URL_ENCODED:-branchforge}@postgres:5432/${POSTGRES_DB:-branchforge}
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  backend:
    image: ghcr.io/mikkisguy/branchforge-backend:${IMAGE_TAG:-beta}
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-branchforge}:${POSTGRES_PASSWORD_URL_ENCODED:-branchforge}@postgres:5432/${POSTGRES_DB:-branchforge}
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    volumes:
      - ./uploads:/app/apps/backend/uploads

volumes:
  postgres_data:
```

Compose constructs the containers' `DATABASE_URL` from `POSTGRES_USER`,
the **URL-encoded** password, and `POSTGRES_DB`. The raw password is still
passed to the `postgres` container itself. A standalone `DATABASE_URL` is only
used by the manual/non-Compose command below.

### Database URI password encoding

The PostgreSQL connection URI embeds username and password directly, so
characters that are syntactically meaningful in a URI must be percent-encoded
(RFC 3986). The `postgres` container keeps receiving the **raw** password via
`POSTGRES_PASSWORD`; only the composed `DATABASE_URL` needs the encoded form.

Docker Compose interpolation is plain `${VAR}` substitution — it cannot encode
for you — so keep a second variable in `.env` that holds the encoded password
and reference it in the URI:

```bash
# .env
POSTGRES_PASSWORD=p@ss:word/2026              # raw — used by the postgres container
POSTGRES_PASSWORD_URL_ENCODED=p%40ss%3Aword%2F2026  # encoded — used in DATABASE_URL
```

Common characters and their encodings: `@` → `%40`, `:` → `%3A`, `/` → `%2F`,
`?` → `%3F`, `#` → `%23`, `%` → `%25`, space → `%20`.

Generate the encoded value from the raw one instead of hand-editing:

```bash
# Node.js
node -e "console.log(encodeURIComponent(process.env.POSTGRES_PASSWORD))"

# Python
python3 -c "import os, urllib.parse; print(urllib.parse.quote(os.environ['POSTGRES_PASSWORD'], safe=''))"
```

Passwords made only of letters, digits, `-`, `_`, `.`, and `~` need no
encoding and may reuse `POSTGRES_PASSWORD` directly.

### Upgrading PostgreSQL 16 to 18

The shipped image moved from PostgreSQL 16 to `postgres:18-alpine`. **The 18
image cannot read 16 data files.** PostgreSQL 18 also changed its data
directory layout inside the image: PGDATA moved from `/var/lib/postgresql/data`
(16) into a versioned subdirectory such as `/var/lib/postgresql/18/docker`.
The existing named volume `postgres_data` therefore mounts at
`/var/lib/postgresql` and is not portable across the major upgrade — a
dump-and-restore is required **before** pulling the new image:

1. **Stop the writers:**

   ```bash
   docker compose stop backend migrate frontend
   ```

2. **Dump the data with the old (16) container still running:**

   ```bash
   docker compose exec postgres pg_dump -U branchforge -Fc branchforge \
     > branchforge_pg16.dump
   ```

   If you created additional roles or global objects, also run
   `pg_dumpall --globals-only` and capture its output.

3. **Tear down the old database and its volume.** Verify the dump is non-empty
   and keep a copy off-host before deleting anything:

   ```bash
   docker compose down
   docker volume rm branchforge_postgres_data   # adjust to your volume name
   ```

   Keep the removed data recoverable (e.g. `docker volume create` + copy) or
   delay removal until the restore is verified if you need a rollback path.

4. **Pull the new image and start PostgreSQL 18:**

   ```bash
   docker compose pull postgres
   docker compose up -d postgres
   docker compose ps postgres   # wait for "healthy"
   ```

5. **Restore the dump into 18:**

   ```bash
   docker compose exec -T postgres pg_restore -U branchforge -d branchforge \
     --clean --if-exists < branchforge_pg16.dump
   ```

6. **Bring the stack back up** — Compose runs the one-shot `migrate` service
   against the restored data before starting the backend:

   ```bash
   docker compose up -d
   ```

   Check `docker compose logs migrate` to confirm migrations completed.

### Custom Docker Compose

For production with HTTPS:

```yaml
services:
  postgres:
    # ... (same as above)

  backend:
    # ... (same as above)

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - frontend
      - backend

volumes:
  postgres_data:
  backend_uploads:
```

## Manual Deployment

### Backend

1. **Build:**

   ```bash
   cd apps/backend
   pnpm build
   ```

2. **Set environment:**

   ```bash
   export NODE_ENV=production
   export DATABASE_URL="postgresql://..."
   export SESSION_SECRET="..."
   # ... other env vars
   ```

3. **Run the compiled production migration command:**

   ```bash
   pnpm db:migrate:prod
   ```

   Run this as a one-shot release job before starting or replacing application
   instances. Concurrent jobs are serialized with a PostgreSQL advisory lock.

4. **Start:**
   ```bash
   pnpm start
   ```

### Frontend

1. **Build:**

   ```bash
   cd apps/frontend
   pnpm build
   ```

2. **Deploy `dist/` directory:**
   - Upload to web server (Nginx, Apache, etc.)
   - Or deploy to Vercel, Netlify, etc.

3. **Configure reverse proxy (Nginx example):**

   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       root /var/www/branchforge/dist;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       location /api/ {
           proxy_pass http://localhost:3000/api/;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
       }
   }
   ```

## Database Management

### Production migrations

The backend image contains both the compiled migration runner and the exact SQL
journal for that image version. On initial deployment and upgrades, use:

```bash
docker compose pull
docker compose up -d
```

The `migrate` container exits after applying pending migrations. Drizzle tracks
completed migrations, so rerunning it is safe. To rerun it manually or inspect
its output:

```bash
docker compose run --rm migrate
docker compose logs migrate
```

If it fails, do not bypass the dependency or start the backend manually. Check
the migration logs and database connectivity, correct the cause, then rerun the
one-shot service. Existing backends can keep serving during an upgrade, so
migrations must remain backward-compatible with the previous application
version; stop the backend first for blocking or destructive DDL. For a
non-Compose platform, run this release command from the backend image before
rolling out application instances:

```bash
pnpm --filter @branchforge/backend db:migrate:prod
```

`DB_MIGRATION_LOCK_TIMEOUT_MS` controls how long the job waits for another
migration job and defaults to 60 seconds. Schema migrations are generated and
committed during development; never write or modify production migration files
on the server.

### Backups

**Manual backup:**

```bash
docker compose exec postgres pg_dump -U branchforge branchforge > backup_$(date +%Y%m%d).sql
```

**Automated backup (cron):**

```bash
# Add to crontab
0 2 * * * docker compose exec -T postgres pg_dump -U branchforge branchforge > /backups/backup_$(date +\%Y\%m\%d).sql
```

### Restore

```bash
docker compose exec -T postgres psql -U branchforge branchforge < backup_20260406.sql
```

## SSL/TLS Setup

### Using Let's Encrypt (Certbot)

1. **Install Certbot:**

   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   ```

2. **Generate certificate:**

   ```bash
   sudo certbot certonly --nginx -d yourdomain.com
   ```

3. **Configure Nginx:**

   ```nginx
   server {
       listen 443 ssl http2;
       server_name yourdomain.com;

       ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

       # ... rest of config
   }

   server {
       listen 80;
       server_name yourdomain.com;
       return 301 https://$server_name$request_uri;
   }
   ```

4. **Auto-renewal:**
   ```bash
   sudo certbot renew --dry-run
   ```

## Monitoring & Logging

### View Logs

**All services:**

```bash
docker compose logs -f
```

**Specific service:**

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Health Checks

Check if services are running:

```bash
docker compose ps
```

BranchForge exposes two backend probes:

- `GET /api/health` — **liveness**. Confirms the Node process is up. It does
  not check Postgres.
- `GET /api/health/ready` — **readiness**. Confirms Postgres answers
  `SELECT 1`. Compose and the backend image healthchecks use this endpoint
  so the frontend only starts once the API can serve database-backed traffic.

```bash
# Liveness
curl http://localhost:3000/api/health

# Readiness (used by Docker healthchecks)
curl http://localhost:3000/api/health/ready
```

## Performance Optimization

### Frontend

- Enable gzip/brotli compression in Nginx
- Use CDN for static assets
- Enable HTTP/2
- Cache static assets long-term
- Use service workers for offline support (planned)

### Backend

- Enable connection pooling in PostgreSQL
- Use Redis for caching (planned)
- Optimize database queries with indexes
- Use CDN for avatars/images (planned)

## Scaling

### Horizontal Scaling

For high traffic, consider:

1. **Load balancer** (Nginx, HAProxy, AWS ALB)
2. **Multiple backend instances** (stateless design supports this)
3. **Session store** (Redis for distributed sessions)
4. **Database replication** (PostgreSQL streaming replication)

### Vertical Scaling

- Increase Docker container limits
- Use larger database instances
- Add CPU/RAM as needed

## Troubleshooting

### "Database connection failed"

- Check PostgreSQL is running: `docker compose ps`
- Verify DATABASE_URL in .env
- Check PostgreSQL logs: `docker compose logs postgres`

### "Frontend shows 404 on routes"

- Ensure Nginx `try_files` is configured
- Check Vite build output
- Verify BASE_URL matches deployment path

### "Session expires immediately"

- Check SESSION_SECRET is set and stable
- Verify SESSION_MAX_AGE (milliseconds) is within bounds (1h–30d; defaults to 24h). Note: with sliding expiry, this is an inactivity timeout, so very short values log users out quickly
- Check browser cookie settings

### "File upload fails"

- Check uploads directory permissions
- Verify file size limits (max 500KB for avatars)
- Check disk space

## Security Best Practices

1. **Use HTTPS** in production
2. **Keep dependencies updated**: `pnpm update`
3. **Use strong, random secrets**
4. **Restrict database access** to application user only
5. **Enable firewall** (only expose necessary ports)
6. **Regular backups** with off-site storage
7. **Monitor logs** for suspicious activity
8. **Run security audits**: `pnpm audit`

## Cloud Deployment Guides

### AWS

- **EC2**: Manual deployment or Docker
- **RDS**: Managed PostgreSQL
- **ECS/ECR**: Container orchestration
- **S3**: Static assets and backups

### Google Cloud

- **Compute Engine**: Docker deployment
- **Cloud SQL**: Managed PostgreSQL
- **Cloud Run**: Container hosting
- **Cloud Storage**: File storage

### Azure

- **Virtual Machines**: Docker deployment
- **Azure Database for PostgreSQL**: Managed database
- **Azure Container Instances**: Quick deployment

### Heroku (EOL - migrate elsewhere)

⚠️ **Heroku is shutting down** - migrate to another platform.

### Render

- **PostgreSQL**: Addon available
- **Web Service**: Deploy Docker image
- **Environment**: Set via dashboard

### Railway

- **PostgreSQL**: Addon available
- **Service**: Deploy from GitHub
- **Environment**: Automatic from repository

## Support

For deployment issues:

- Check [SUPPORT.md](SUPPORT.md)
- Open an issue with logs and config
- Join community chat for real-time help

---

Need professional deployment assistance? See [SUPPORT.md](SUPPORT.md) for contact options.
