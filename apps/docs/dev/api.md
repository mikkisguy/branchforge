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

## Project-file structural operations

All endpoints below require the project owner. Paths are project-relative
Ren'Py `.rpy` paths.

- `PATCH /api/projects/files/:fileId` — rename or move with
  `{ filePath, expectedContentHash? }`.
- `POST /api/projects/files/:fileId/delete-impact` — returns active labels and
  every incoming jump, call, and menu-choice occurrence.
- `DELETE /api/projects/files/:fileId` — hard-deletes ZIP files and tombstones
  GitLab files until push or restore.
- `GET /api/projects/:projectId/files/pending-structural` — collapsed pending
  create/rename/delete operations plus the content-change count.
- `POST /api/projects/files/:fileId/reverse` — cancels a creation, undoes a
  rename, or restores a deletion.
- `POST /api/projects/:projectId/files/discard-all` — transactionally restores
  the project to its remote file structure.

## Rate Limiting

Public endpoints (especially auth) are rate-limited. See the rate limiter service for details.
