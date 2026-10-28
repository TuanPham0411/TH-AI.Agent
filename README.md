# TH AI Agent

Independent basic AI Agent workspace at https://ai.th.io.vn. Repository: https://github.com/TuanPham0411/TH-AI.Agent. This application has its own frontend/API, database, files, Docker images and release workflow. It does not depend on Portfolio/MES source, accounts or cookies.

## Available now

Responsive dark/light/system interface, Vietnamese/English preferences, agent-role and capability introductions, a simple reviewable workflow overview, and **Prompt Studio**: enter a goal, context, constraints and desired output, then prepare/copy/download a structured prompt locally. Prompt text is not transmitted to a model or saved on the server. There is no fabricated chatbot, active agent, workload count or login. Model/provider integration and authenticated tools are intentionally not configured in this basic release.

## Develop

Node.js 22.12+, PostgreSQL 17. Run `npm ci`, `npm test`, `npm run build`; `npm run dev:server` starts the API at loopback 3100 and `npm run dev` starts the Vite frontend proxy. Configure a dedicated `DATABASE_URL`, run `npm run migrate` first. Database integration tests use a disposable `TEST_DATABASE_URL` and `npm run test:integration`. `/api/health` identifies the API, `/api/ready` verifies the schema/database rather than implying a connected AI model.

## Docker

Copy `.env.example` to a private `.env` and set two distinct generated hexadecimal passwords. Later run `docker compose up -d --build`. Separate services: PostgreSQL (no published DB port), migration operator, restricted API role, and Nginx web. Host loopback port **8081**. Published AMD64/ARM64 images: `ghcr.io/tuanpham0411/th-ai-agent-api:latest` and `ghcr.io/tuanpham0411/th-ai-agent-web:latest`; immutable commit tags are also published. Named volumes persist database/files.

## Build only — production deferred

GitHub Actions builds/tests on hosted runners, packages checksummed source and ARM64 release archives with official Node.js 22, and publishes images. Artifacts are retained for 30 days. Previous RPI deployment and runner verification triggers have been removed; nothing automatically deploys to the old RPI. A newly provisioned TH-Server, secrets, database and explicit deployment authorization are required before going live.

Read [replacement-server guide](docs/REINSTALL.md) and [release usage](RELEASE-README.md). The legacy native installer remains as an optional reviewed reference; the independent Docker Compose configuration is the recommended fresh-server path. No runtime data, secrets or runner credentials are included.


## TH-Server managed storage

The optional `storage.compose.yaml` enables the canonical TH-RPI.Server broker.
Application SQL transactions are acknowledged by Drive before committing the local
PostgreSQL projection. Unchanged reads stay local. SQL function writes, background
jobs and metadata changes use the same capture protocol. Each application has a
separate broker credential, database and files volume. Do not copy Drive OAuth tokens
into this repository or switch a provider manually.

The managed deployment workflow runs only after a successful trusted main build. It
uses the deployment implementation pinned from TH-RPI.Server, retains existing
volumes and .env, creates a local database backup, uploads a Drive baseline and
verifies application readiness. A failed migration keeps the maintenance fence and
backup for operator recovery instead of silently accepting unsynchronized writes.

In central Drive-first mode, the Google owner can sign in from Prompt Studio and
save named drafts privately. Each save is revision-checked and is acknowledged
only after the server platform has committed the JSON to Drive. The draft list
and preferences use the local PostgreSQL projection for reads. Anonymous editing
remains in the open browser tab; saving requires explicit owner action. Google
OAuth and session persistence belong to TH-RPI.Server, not the AI container.
Register `https://ai.th.io.vn/api/oauth/callback` in the existing OAuth client.
