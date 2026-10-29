# TH AI.Agent Studio

An independent workflow studio, without n8n. The canvas, node registry, graph validation and execution engine are owned by this repository; shared storage, timers, Function isolation and deployment are managed by TH-RPI.Server.

## Editing and execution

Drag blocks from the library or click to add, move their headers, and click compatible ports to connect. Flow ports execute a directed acyclic process. Model, memory and tool ports supply dependencies to agents. The inspector provides configuration, connections, actual input/output and operator notes. Undo/redo, JSON import/export, fit, pan, zoom and a minimap are available. Active edges and nodes animate only while the corresponding recorded execution is running. Reduced-motion preferences are respected.

The owner signs in using the existing Google owner login. Save a workflow before running it. Conflicting revisions are rejected. Each run and each step is acknowledged by the shared Drive-first storage layer before external processing continues. Results and traces are private. Long trace values are explicitly marked as truncated previews; the final output remains available in the run record. One workflow runs at a time, with an overall 180-second deadline. Interrupted runs are not automatically replayed.

Built-in blocks: chat, timer, agent, delegated agent, cloud model (Gemini/OpenAI/Claude), conversation memory, short planning note, Perplexity search, Google Sheets append, JavaScript Function, condition, static JSON fields, statistics, report, PostgreSQL read and sticky notes.

## Credentials and providers

API keys and database connection strings are entered into the private credential panel. The API never returns saved secrets. TH-Server encrypts credential rows in the Drive ledger. They are not included in workflow exports. Only configured provider models and attached tools can be invoked. API usage is charged by each provider where applicable; no subscriptions or model keys are bundled with Studio.

For Google Sheets, use the existing Web OAuth client, enable Sheets API, and keep `https://ai.th.io.vn/api/oauth/callback` authorized. Save the Client ID/Secret privately in Studio and connect the owner account. The connection uses PKCE and a session-bound, expiring state. Google Photos remains Portfolio-only.

Google Sheets and add-in POST calls require explicit write approval for the run, or the separate scheduled-write permission saved with an active timer workflow. Writes are not automatically retried. If a write response is lost, inspect the external service before running again.

PostgreSQL connections should use a database account with read-only permissions. Queries execute as single statements inside a read-only transaction with a 5-second SQL timeout and a 200-row result limit.

## Functions and timers

The Function editor accepts JavaScript using `input` and `return`. Local tests run in a terminable Web Worker with a response CSP that forbids network access, imports and nested workers. Production Functions run in disposable containers through TH-Server's private authenticated supervisor. No host files or application credentials are passed to the Function. The container is read-only, has no network or capabilities, uses UID 65534, and has strict CPU, memory, PID, output and time limits. The Docker socket is not mounted in the application or Function container.

Timers have a minimum interval of five minutes. Activate the schedule explicitly and save it. TH-Server ticks every minute even when the browser is closed. The schedule claim and queued run are recorded in one durable transaction. Overlapping runs wait for the single execution slot. Invalid or interrupted runs are visible in history and are not silently replayed.

## Add-in manifest

Add-ins are declarative API connectors, not arbitrary packages installed into the Pi. Install a reviewed manifest through the owner panel:

```json
{
  "id": "github",
  "name": "GitHub API",
  "description": "Read the connected GitHub account.",
  "baseUrl": "https://api.github.com",
  "path": "/user",
  "testPath": "/user",
  "method": "GET",
  "auth": "bearer"
}
```

The block appears in the Add-ins category and can be used as a flow step or an agent tool. Configure its token separately. Supported authentication is `none`, `bearer` or `apiKey` (`X-API-Key`). HTTPS destinations are pinned to the approved origin; private/special DNS addresses and redirects are rejected. API writes use `POST`, require approval, and are not retried. Required permissions and API availability depend on the platform. Installing a connector does not claim that a Facebook, shopping or other account is already authorized.

More specialized nodes can be implemented in `site/workflow-model.js`, `server/workflow-engine.js` and `server/studio-providers.js`, with explicit fields, ports, validation and provider tests. Keep shared operational mechanisms in TH-RPI.Server.


## English single-user experience (October 2026)

This release focuses on the user workspace. Google owner login remains available. Firebase accounts, multi-user isolation and administration are deferred; there is no public multi-user execution. Anonymous visitors can design, import/export, explicitly save a browser-only draft and run local JSON/Function/statistics/report previews. Browser drafts are not cloud backups.

The catalog includes Google Workspace, Microsoft Graph, GitHub, Slack, Jira, Discord, Meta, TikTok, Shopify, WooCommerce, Stripe, Shopee, TikTok Shop and Resend. Presets use fixed API paths, editable fields and typed input mappings. Each connector includes credential setup steps, official documentation, account/approval requirements and pricing notices. A preset is not evidence of a connected account. Provider app review, regional access, API changes and permissions may affect availability. API keys are user-supplied; no paid calls are made to test generic account access.

Google authorization requests selected service scopes incrementally and uses the existing authorized callback. Microsoft uses a registered public-client application and device-code flow; enable public client flows and obtain organizational consent when required. Secrets are never returned to the browser. Blank secret fields preserve existing provider secrets. Changing an origin requires a replacement token.

Nineteen organizational roles define scope, deliverables and allowed tool capabilities. The server validates role grants before calling the model or tool; a prompt cannot grant additional capabilities. Publishing tools require a Publisher role and per-run write approval. Role permissions can be narrowed in workflow JSON but cannot exceed the selected role.

AI queries and media jobs require explicit potential-charge approval. Scheduled paid work needs a separate saved permission. Content and Script agents produce drafts; they do not silently publish. Replicate image/video jobs record submission intent before the paid request and return an asynchronous job reference. Refresh Media jobs for provider status. A failed submission acknowledgement is marked uncertain and is never automatically retried. Completed outputs may be explicitly archived to Drive-first storage (64 MB per file, up to eight outputs per job); download larger outputs from the provider. Media URLs can expire. Archives are acknowledged only after the storage commit succeeds.

The Pi 3 remains a single-worker coordinator. Cloud services perform AI and video processing. For sustained multi-user execution, use a separate host with at least 8 GB RAM, four cores and SSD storage; local video generation additionally needs suitable GPU hardware. A second 1 GB Pi does not remove these limits.
