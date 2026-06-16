---
title: API Reference
---

# API Reference

The BranchForge backend is a Fastify REST API served at `/api`.

::: tip
Interactive API documentation (Swagger/OpenAPI) is planned for v1. Until then, refer to the route implementations in `apps/backend/src/routes/`.
:::

## Main Route Groups

| Group                | Endpoints                  | Description                           |
| -------------------- | -------------------------- | ------------------------------------- |
| `/api/auth`          | POST `/login`, `/register` | Authentication and session management |
| `/api/projects`      | GET, POST, PUT, DELETE     | Project CRUD operations               |
| `/api/labels`        | GET, POST, PUT, DELETE     | Label management for flow graph       |
| `/api/label-lines`   | GET, POST, PUT, DELETE     | Line-label associations               |
| `/api/characters`    | GET, POST, PUT, DELETE     | Character CRUD operations             |
| `/api/stats`         | GET, POST, PUT, DELETE     | Numeric stat tracking                 |
| `/api/variables`     | GET, POST, PUT, DELETE     | Boolean flag management               |
| `/api/flow`          | GET `/graph`, `/labels`    | Flow graph data                       |
| `/api/gitlab`        | GET, POST `/sync`          | GitLab repository sync                |
| `/api/project-files` | GET, POST, DELETE          | RPY file management                   |
| `/api/exports`       | GET `/zip`                 | Project export                        |
| `/api/settings`      | GET, PUT                   | User settings                         |

## Authentication

Most endpoints require authentication via session cookies. The session is created by `/api/auth/login` and validated on each request.

## Rate Limiting

Public endpoints (especially auth) are rate-limited. See the rate limiter service for details.
