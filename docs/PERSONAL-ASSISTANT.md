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

## Typed working environment (November 2026 update)

Connections now use distinct contracts and setup cards, grouped as databases, network/services, social/messaging, Office/personal tools and media. Each card explains the required account, fields, scopes, execution location and supported operation. Saving a credential is not verification. A separate **Test saved connection** performs a read-only capability check; a Page/profile check does not prove publishing or messaging permission.

- PostgreSQL/MySQL/SQL Server/Oracle: host, port, database/service, read-only username/password. Driver credentials are assembled in the vault. Existing URI-only credentials can be retained in Advanced setup. SQL Server requires verified encrypted transport; MySQL's structured setup uses TLS. MongoDB accepts a private database URI. Firestore requires a project and OAuth access token, not a public Firebase API key.
- ODBC: trusted HTTPS gateway, DSN reference and gateway token. The DSN/driver/database login remain on the gateway. The DSN reference documents the destination; `/query` uses the gateway's configured DSN, not an arbitrary model-selected DSN.
- Network: fixed HTTPS origin, operation path/method, independent health-check path and None/Bearer/Basic authentication. Only saved endpoint/method is callable. GET is read-only; POST requires write approval. A network failure after a write is uncertain and is not replayed automatically. This is not a VPN/TCP/SMB tunnel.
- Facebook: authorized Page publishing. Messenger: separate Page/PSID messaging capability and permissions; WhatsApp Business: separate business/phone-number IDs and business token. Text/template messages return provider message receipts. Consent, app review and messaging-window rules still apply. No inbound conversation webhook/consumer-account password login is claimed.
- TikTok: creator profile/account read only in this connector; saving a token does not enable Direct Post. Microsoft 365: read a configured Microsoft Graph resource with the appropriate access token/scopes. These manually supplied OAuth tokens expire and need renewal. Desktop Office is a separate computer action.

### Outbound laptop agent

**Connections → Pair / manage a computer → Create pairing token** issues a dedicated device credential shown once. It cannot authenticate to owner/workspace routes. The Windows installer downloads `personal-device.py`, `personal-bridge.py` and `office-tool.ps1`, prompts privately for the token, stores it in a user-restricted local folder and installs an interactive user logon task. Python 3.10+ is required and is not installed silently. No inbound port, laptop TLS certificate or router change is needed; the agent connects outward to the application's trusted HTTPS endpoint.

Run the displayed PowerShell installer command with **-FullControl** to enable native Python/PowerShell/CMD execution and file read/write under the logged-in user's permissions. Omitting it leaves only configured actions and source inspection. This does not grant administrator elevation, make a powered-off laptop reachable, or turn desktop actions into server automation. Full control is native account-level execution, not a code sandbox or a visual remote desktop/browser-control application. To stop it locally, stop/disable the **TH Personal Device Link** startup task. **Revoke access** on the website invalidates the device token; an already executing command cannot be undone.

The device advertises its enabled actions. A connection selects one actual action, with its own input contract/read-write effect. `office` supports Excel range reads and new `.xlsx` writes, and Word text reads/new `.docx` writes via COM. Installed Windows Office and an interactive session are required. Local output paths are not represented as server download URLs. Windows installer/COM integration must be verified on a real Windows machine; Linux tests verify the Python bridge and local Python/file actions, not Office COM.

Device tasks and claims persist in migration **006**. A task is claimed once, with a device-bound claim key and deadline. The agent journals a claim before execution and persists the result before acknowledging it; reconnecting retries the acknowledgment, not the command. Expired/uncertain writes require outcome review. Device tokens are hashed on the server. Heartbeats do not revise automation connection scope. Device state and tasks participate in the same Drive-first capture, backup and schema-baseline recovery as the rest of the application.

### Workflow visibility

The live canvas now shows each actual function as a separate card: tool icon, step title, connection, execution location and state. Solid arrows show actual dependencies and execution order; a distinct mapped-data rail shows explicit upstream references. Independent branches are arranged side by side, with layer labels. Animation is tied to executing/waiting steps. The connected-tools shelf opens each tool's own setup. Fit/zoom and the step inspector help inspect arguments/evidence without a second dashboard.


### Composed operations, branches and layers

The Director can create a directed acyclic graph rather than only a linear procedure. `dependsOn` declares prerequisites; omitted dependencies retain the earlier sequential behavior, while `[]` creates an independent root. Upstream input mappings add their own prerequisites. Steps must be listed in topological order; invalid/cyclic/forward dependencies are rejected before tools run. An `operation` label groups the business meaning of a step.

Each job dispatches at most two ready tools concurrently (two job workers remain available). A join waits for its branches and either collects results or concatenates actual bounded row collections. A condition compares actual upstream values using fixed operators; `when` gates a branch. Inactive branches are marked skipped and are never represented as successful tool calls. A timer checkpoints its wake time and releases the worker, so browser tabs and other jobs remain independent. This release has bounded DAGs, not arbitrary cyclic/unbounded loops or an unlimited parallel executor.

All members of a frontier pass exact-effect approvals before dispatch. Outcomes are settled and committed individually: a failed/uncertain sibling does not erase confirmed results. Unknown writes are not replayed. Saved automation scope includes dependencies, operation labels and conditions; changing the graph requires renewed scope approval.

### 37 inactive workflow examples

The Examples library covers every tool and connection family, including seven database-to-Excel variants, CSV/JSON, source/report/media/asset tools, social/messaging, Office and native desktop tools, portability migration, and combined conditional/parallel/delay operations. Migration 006 adds the initial example definitions without creating jobs or enabling automation. Definitions are idempotent and do not overwrite owner edits.

Preview is a configuration view, with pending/example labels; it never calls a model or executes tools. Configure a copy, bind existing connections, replace `YOUR_` placeholders and edit step inputs/dependencies/conditions in its JSON section. Saved copies remain drafts with automation off. Prepare a request sends the saved procedure through the assistant/Director clarification and approval flow. Only a successful real run turns a draft into a verified reusable workflow eligible for automation.

Reports can use `from` and an instruction to author content only after actual upstream evidence exists. This calls the same Director, within the existing model-call budget, rather than inventing analysis in a report prepared before data was retrieved. Truncated evidence is marked for the Director.

## Local DSNs and live model setup

ODBC now offers **DSN on a paired computer** as well as the existing HTTPS gateway. Pair/update the Windows agent with **-EnableOdbc** to install `pyodbc` in that Python runtime. For an existing pairing the standalone installer preserves the token, roots and custom actions; **-RePair** explicitly replaces the pairing token. **-PythonPath** selects a Python executable whose 32/64-bit architecture matches the installed Oracle/ODBC driver. The web UI reports the actual runtime bitness, driver names and visible DSNs. User DSNs must belong to the account running the agent; matching a DSN name alone does not establish driver/TNS compatibility.

For the illustrated Oracle setup, choose the paired computer, DSN `odssg_vn`, Oracle dialect and private database user/password. Keep the existing TNS Service Name in the Windows DSN; do not put a TNS alias into an HTTPS URL. The connector opens a read-only connection, begins an Oracle read-only transaction, uses scalar bound parameters and returns bounded actual rows. It rolls back/closes after each operation. SQLSTATE-based errors explain common DSN/bitness/login failures without returning driver login messages. Oracle itself must be verified on the owner's Windows installation; real SQLite ODBC plus Oracle-driver contract fixtures are used in automated tests.

Database credentials remain in the existing vault. Durable relay tasks contain only the connection reference/revision and query; credentials are injected into the authenticated device response only after the server verifies the device/connection binding. They are not copied into the task table, model context or local task journal. A desktop DSN is still not eligible for unattended server automation.

The client/server/cloud split applies to future adapters too: Office, text editors, browsers, files/folders/shared drives, Access/ODBC and coding tools belong on the client when they depend on that machine. Shared services may run on the server. Google/social/Canva/GitHub services use their actual supported APIs and personal/service credentials. Installed ChatGPT/Codex applications and subscriptions do not automatically supply API access. This classification is not a claim that every application's UI automation adapter has been implemented; only discovered/configured actions are callable.

Assistant and Director setup now load compatible, account-visible models directly from their provider using each role's saved key (or its existing provider fallback). Lists refresh when setup opens, when the provider changes, every five minutes while visible, and via **Save key / refresh models**. Short server caching limits list requests. The current model ID remains unchanged until the owner selects a model and saves setup. Provider-reported names/versions/limits are shown where available; listing is not proof of inference access, quota or billing, and unsupported endpoint-specific models are not advertised as executable through the chat runtime. No generation request is sent merely to browse the list.

## Operational workspace layout

The default desk uses a compact application header, a resizable assistant column and a workflow canvas. Introductory banners, decorative idle nodes, repeated work titles and the brand footer are removed. Only actual work renders a graph; a conversation-only response does not pretend to prepare tools. Input/output, activity and results open in a contextual, resizable panel. Tool setup is available from a small drawer and the shared Connections dialog. Saved workflows and examples share a searchable library with separate tabs.

Settings displays both model roles side by side on desktop. Dialog headers remain outside the independently scrolling form body; controls, fields, status colors, custom scrollbars and focus states share one visual language. Resize preferences store numeric dimensions locally. Polling defers repaint during an active drag; text selection/drafts, canvas scroll and relevant keyboard focus are retained. New-node/popup transitions are short, and live signal motion is limited to actual active paths. Reduced-motion preferences disable transitions/animations. The mobile operator view remains conversation/results only.

`TEST_DATABASE_URL=... node tests/workspace-ui.browser.mjs` verifies layout density, search, keyboard/drag resizing during an actual polling update, contextual details, dialog scrolling, reduced motion and desktop/laptop/mobile layouts without model/tool execution. The existing company browser test continues to verify real database-to-XLSX output and fixture publication approvals after the UI changes.

## Work manager and plan review

The header's **Work manager** opens Tasks (search and paginated history), Automation (verified workflows, next schedule and Play/Pause/Stop) and Chat history. Task links restore the actual graph/results; each task's chat can be read or cleared, or all displayed chat can be cleared. Clearing erases message content but retains request IDs for deduplication, task inputs/results and schedules. It does not delete a workflow or cancel execution.

New requests submitted through the web workspace request plan review. After the Director produces real executable steps, a manual run pauses before its first tool. Review the graph, select a block for Input/Output, choose **Edit workflow** for pending block titles/connections/inputs and **Resume** to execute. Already-started/completed blocks are immutable and their results are retained. Automation follows its previously approved scope and does not require a fresh manual plan review every run.

Pause and Stop are cooperative: an in-flight bounded model/tool call finishes and records its result; no further block starts after the safe checkpoint. Resume continues the saved phase and confirmed steps. Stop retains confirmed results. Automation Pause disables future scheduling and pauses active work; Stop disables scheduling and cancels active work at the same safe boundaries. Play preserves the existing daily counters and uses the previously approved bounded configuration. An uncertain external write still requires checking its real outcome; these controls do not replay it.

Connections supports Add, Configure, Test and Delete. Deletion removes the saved credential too and is refused while nonterminal work or enabled schedules reference the connection. Disabled recipes are retained and require a replacement connection before reuse. The canvas shows block-count progress, distinct execution/data paths and neon motion only for active signals; reduced-motion disables moving effects. Planning/clarification has no fabricated progress percentage or invented tool blocks.

## Facebook through a paired visible browser

Choose **Facebook · Browser on your computer** for browser publishing instead of the separate Pages API connection. Install/update the Windows device link with `-EnableFacebookBrowser` (Playwright) and choose installed Chrome/Edge using `-BrowserChannel chrome|msedge`; `chromium` downloads Playwright Chromium. The existing pairing/ODBC/actions are preserved unless explicitly replaced. The connection binds one paired device, fixed Facebook destination and exact posting identity name, with no Facebook password/token/cookies in server credentials or model inputs. Sign-in is an explicit local interactive window; login/OTP/CAPTCHA are not automated or bypassed.

The agent reports `facebook_login`, `facebook_check` and `facebook_publish` only when locally enabled and Playwright is available. Web buttons request sign-in or check the composer; neither publishes. The usual publish block handles exact-payload approval before dispatching a bound one-time device task. The poller revalidates connection/device/revision and injects the fixed profile/destination/identity. The agent journals task claims before dispatch and does not replay after a crash.

The adapter uses a dedicated persistent profile, opens a visible browser, recognizes English/Vietnamese composer controls, verifies the configured posting identity, fills the caption/link, uploads up to four approved local media paths or one saved server asset (20 MB), clicks Post and seeks a new matching recent permalink. It closes only its own context. Login, unrecognized controls, identity mismatch and deadlines stop preparation; failures after a Post attempt are uncertain and require checking Facebook before retry. Facebook's live UI/permissions can change; fixture tests do not prove that a particular real account can post.

A media→browser-publish workflow archives actual provider output into the existing file library before device upload. Claimed-task media downloads require that paired device's token/generation, a matching live task and a supported saved asset; they expire after completion. The media file is temporarily downloaded into the agent's private working directory and deleted after the invocation. Arbitrary remote image URLs are refused instead of silently omitted. Two inactive workflow examples cover local media and generated images.

Laptop browser connections remain desktop-only and cannot be enabled as independent server automation. They can finish approved work without the website tab, but the paired computer must remain awake and on an interactive desktop. A headless server browser is not installed by this release. See `/facebook-browser-setup.html` for owner setup.

## Workspace entrance

A fresh page traces the actual DOM geometry with SVG strokes: header, dividers, buttons, input and canvas edges. Each cursor stays at its stroke endpoint, then follows the current grapheme while real labels/headings/placeholder text type in their existing layout. This is a visual document entrance, not extra AI workers or backend activity. Authentication renders remeasure current geometry on the same timeline; fonts also trigger a geometry refresh. Text retains a complete accessible equivalent, and original text nodes/styles are restored after about five seconds or immediately on pointer/keyboard/wheel input, resize, hidden tab or reduced motion. No input values are changed. Narrow screens use two pointers. The effect adds no model/network calls or animation library.
