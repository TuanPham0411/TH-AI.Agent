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
