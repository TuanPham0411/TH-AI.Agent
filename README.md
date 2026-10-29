# TH AI.Agent — n8n workspace

n8n Community runs at https://ai.th.io.vn with an editable multi-agent workflow: AI Agent, Research Agent, Sheet Agent, Gemini models, private PostgreSQL memory, Think, Perplexity and Google Sheets.

Read [setup, credentials, operation and recovery](n8n/README.md). The initial workflow is inactive until provider credentials and the destination spreadsheet are configured. Installing the workspace does not make paid model calls.

## Build and deployment

`.github/workflows/n8n.yml` tests an actual n8n runtime and workflow import, publishes immutable AMD64/ARM64 runtime and gateway images to GHCR, and deploys using the `th-ai.agent` runner. Shared deployment, swap, encrypted Drive backup and isolated restore verification are managed by `TH-RPI.Server/n8n/`.

n8n uses its own `th_n8n` PostgreSQL database and a backup every 30 minutes to `th-data/ai-agent/n8n/backups/`. This is the agreed PostgreSQL plus periodic backup exception to the other websites' Drive-first storage policy. Keep the TH-Server recovery key outside the Pi.

## Preserved AI foundation

The former Prompt Studio source, database and files remain available for recovery. Its build/deploy workflows are manual, and its deployment refuses to replace an active n8n installation. Legacy development uses `npm ci`, `npm test` and `npm run build`; deployment references are in [RELEASE-README.md](RELEASE-README.md) and [docs/REINSTALL.md](docs/REINSTALL.md). Do not run the legacy Compose stack on port 8081 while n8n owns that port.

No passwords, OAuth secrets, model keys or runtime data belong in Git.
