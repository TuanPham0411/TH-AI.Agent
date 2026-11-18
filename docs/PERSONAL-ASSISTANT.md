# TH personal assistant — two-role company

This is the new default application at thienha.io.vn. It replaces the stacked Office/graph/floor navigation with one conversational desk and a live workflow. Default theme is light. `?legacy=1` retains the earlier editor for controlled recovery; it is not the new product entry point.

## Two model identities

Only **Assistant** and **Director** are orchestration LLM roles. Each has a provider, exact model ID and optional separate private API key. Existing provider keys can be reused server-side when no role-specific key exists. Staff/positions are skill descriptions, not nested agents. There is no automatic model-per-employee expansion. The Assistant interprets a request; the Director applies profiles, plans bounded actions and invokes deterministic tools. Ordinary work normally requires two LLM calls, rather than calls at every staff layer. Schema inspection and clarification can require additional bounded Director calls.

Visual generation is an optional external tool/service with its own provider charges, not a third employee/chat role. The system cannot produce images/video without a configured real media service or actual saved assets.

## Main interaction

A single conversation carries requests, missing-input questions, secure setup cards, approval, recovery and delivery. Replies automatically target the selected waiting work, with a New request escape. Jobs persist before model/tool work. Closing a browser or changing work tabs does not stop the backend. A deep link `/#work/<id>` opens an existing job without executing it again.

The bespoke SVG scene renders two model hubs and actual operation steps. State changes animate only actual work. Source/query data, output files and publication receipts are real outputs, not mock success indicators. Excel uses an Office Open XML workbook; formula-looking cells remain text. Deterministic exports use complete bounded query rows even when the model sees a marked preview.

## Data and lifecycle

Migration 005 adds `company_settings`, `company_connections`, `company_recipes`, `company_jobs`, `company_messages`. New business state is not placed into credential rows; credential material remains in the existing private vault. Original workflow records, files and credentials are not deleted or rewritten. Legacy workflows are discoverable as procedure intents; their old model graphs are not invoked through the new Director.

Job states: queued → running → completed, or waiting_input / waiting_approval / uncertain / cancelled. Successful steps and external intents are checkpointed. After input is supplied, confirmed steps are retained; a missing deliverable cannot be reported as delivered. Unknown writes do not auto-replay. Worker shutdown drains the current bounded operation and preserves work before closing the DB pool. Unexpected restarts recover non-writing work to an explicit continuation request; possible external writes require outcome review.

There are two bounded worker slots. The database claims work with row locks. Concurrency uses the same two configured LLM identities, not additional employee models. Long media jobs save their provider ID, release the slot and poll later without resubmitting paid generation.

## Independent automation

A successful procedure can be enabled with an interval, per-day run quota, Director call budget and explicit write/media scope. The server scheduler claims and queues runs atomically; scheduled runs of one recipe do not overlap. Different jobs can progress concurrently. Daily accounting uses Asia/Ho_Chi_Minh. A tab is a view, not a worker.

Automation snapshots its ordered tool/connection scope and connection revisions. The Director cannot silently add operations, repeat a publication, change a pinned staged tool, or use a changed connection. Missing input, approval, uncertainty and connection changes pause scheduled operation and notify the assistant. Disabling automation cancels queued scheduled work; an already active tool call finishes safely. Successful manual refinements create procedure versions; saved automation scope does not silently expand.

On production cutover the old AI graph execution and legacy timer engine are suspended by default. Their data/flags remain for recovery. An operator may explicitly opt into the legacy engine via `TH_ENABLE_LEGACY_AI=1`; that is outside the new two-role contract. Existing schedules require verification and enabling in the new workspace.

## Tools available in this release

- Parameterized read-only PostgreSQL/MySQL/SQL Server/Oracle/MongoDB/Firestore queries and an HTTPS ODBC gateway contract. Database outputs are bounded (200 rows/150 KB); select/aggregate at the source for larger data.
- Real XLSX/CSV/JSON exports and report files, saved through the existing file/Drive path.
- Authorized Facebook **Page** publishing with text, links, saved image/video uploads or confirmed generated visuals. Personal-profile password automation is not claimed. Platform permissions and valid access tokens are required.
- Replicate image/video submission and status polling with durable references; no fabricated media URLs.
- HTTPS source reads and saved asset lookup.
- Personal bridge actions representing owner-developed tools, Office/Google wrappers, CMD/PowerShell/executables/Python, local folders/files, network services or hardware. Actions require a real reachable bridge and configured executable/service permissions; a catalog entry is not evidence of a working integration.
- Non-executing Python project inspection and controlled transfer/staging to a verified server bridge, followed by an isolated server test.

## Personal bridge and portability

The owner installs `tools/personal-bridge.py` on each participating machine. Download and setup are available at `/bridge-setup.html`. The bridge uses authenticated HTTPS, owner-configured roots and fixed actions. Workflow input goes through JSON stdin; it is not concatenated into command strings. Desktop/native actions execute as the bridge service account. This is not a sandbox for arbitrary host executables; the owner controls which actions/account/permissions are granted.

The application cannot reach an unconnected laptop merely because permission was granted in conversation. A network route, reachable endpoint, trusted TLS certificate and token must exist. The UI probes the bridge's actual reported execution environment. Desktop/laptop-only, GUI/session-dependent and unverified tools cannot be enabled as independent server automation. This refusal is surfaced in the assistant conversation. Online manual use remains possible.

Python inspection parses source/AST and dependencies without importing or running the project. It excludes environments/dependency folders/secrets and flags desktop/hardware/dynamic execution requirements. Static candidacy is not a compatibility proof. Packaging is bounded to 100 small text files/500 KB, hash checked, path confined and protected against zip traversal/symlinks. The server assigns a tool version tied to source hash and entrypoint; source is rechecked before execution.

Server tests require Docker and a preinstalled compatible Python runtime image. Standard-library examples can use `python:3.12-slim`. Third-party dependencies require an operator-prepared image; the system does not silently install packages on the laptop. Tests use non-root, read-only, network-isolated containers with CPU/memory/PID/time limits. Network/hardware/writable-folder needs require separately approved actions. Staging is never represented as a successful run. Automation may reuse a pinned version only after an actual server run and environment verification.

## Migration and recovery

Schema migrations reinstall capture triggers for the new tables. Deployment must back up the retained DB, migrate, create a new Drive baseline **when migration versions change**, verify write-through, and only then replace API/web. The companion change in TH-RPI.Server performs this sequence and accounts for active company jobs. A baseline is essential: old recovery inventories do not contain the new tables.

## Verification and limits

Use a disposable operator PostgreSQL database:

- `npm test` runs unit tests; database tests run when `TEST_DATABASE_URL` is supplied. Integration fixtures create isolated child databases, requiring CREATE DATABASE rights on the disposable cluster.
- `npm run test:browser` checks the preserved recovery UI with explicit legacy URLs.
- `TEST_DATABASE_URL=... npm run test:company` checks the new default UI, secure setup, real query/XLSX download, publication approval/receipt, focus, work tabs and mobile result access.
- `python3 -m unittest discover -s tests -p 'test_personal_bridge.py'` checks static inspection, transfer hash, confinement and a real isolated server run when the preinstalled Python image is present.

Models and social provider responses are fixtures in automated tests. Database queries and generated spreadsheets are real. No test establishes that the owner's Facebook/ODBC/Office account is connected. No paid model/media request or real social publication is required for this verification. Commercial billing, arbitrary desktop GUI automation and automatic dependency migration are not claimed as solved by this release.

### Authority and installation boundary

The owner may grant the bridge service account broad access to their own computer. This grant does not create network access or install an agent by itself. No laptop access, OS change or bridge installation is claimed until a reachable endpoint is actually registered. Fixed native actions execute with the granted account's permissions; source portability inspection is explicitly non-executing. Static scans and common secret filters are not a proof that arbitrary source contains no secrets or that it is safe/compatible. A real isolated server run and explicit unattended eligibility are still required.
