# Powered data I/O

Every executable card displays two bidirectional **data** sockets by default:

- **I/O · Tool** carries internal Flow data, approved tasks, returned reports, observations and assessments.
- **I/O · User** carries direct user requests and responses. Chat/Output bridges use this socket. Requests may combine text, structured JSON, stored image/video/document references and HTTP(S) links. Stored output files have download/preview controls.

**Model, Memory and Tool controller sockets, saved credentials and execution semantics are unchanged.** They remain dedicated sockets. A universal data socket does not grant role permissions or turn an infrastructure block into an operational step. Notes remain documentation without executable sockets.

Click two matching I/O sockets. When multiple directions/branches/purposes are possible, choose the route explicitly. Multiple logical routes share one physical socket. Their exact block IDs, direction and branch purpose remain in the saved graph; existing workflows and all templates display the new sockets automatically without rewiring, rewriting configuration or enabling schedules. Connections lists the multiplexed routes; advanced capabilities control supported logical channels. Controller links are listed separately.

## Addressing and fan-in

The executor creates routing metadata outside user/model payloads. Every message has a unique message ID, run request ID, session ID (when available), source and destination block/socket, logical route, edge ID and optional parent message ID. Responses reverse the exact source/destination and include `replyTo`. Metadata from another executor or a forged object cannot form a response. This is per-run local routing, not an Internet webhook or public message bus.

Classic Flow fan-out/fan-in executes each selected route separately; multiple Output deliveries remain individually identifiable. Managed Flow inputs are queued instead of last-write overwrites. On direct-manager-approved execution, the worker receives `flow` (one value or an array for a batch) and `flowInputs` (message/source/edge/value entries). Each consumed message receives its own correlated acknowledgement. Managers see pending input message/source IDs in the roster. An acknowledgement confirms the block returned; it does not independently prove an external provider action succeeded. Failed/uncertain operations are never automatically replayed.

A single physical socket can accept many links while logical safeguards still apply: one direct manager, one selected model/memory controller, no unauthorized controller rerouting, valid branch types, bounded execution and required write/paid approvals. Choosing the user socket cannot bypass Manager/Supervisor role rules.

## User media

Use **Attach files**, drag/drop or paste for stored media, and **Add link** for up to ten HTTP(S) references without embedded credentials. Adding a link does not fetch it: a search/web/service block must be explicitly configured to retrieve content. Up to five files per request, 16 MB each for storage; model inline input remains 6 MB total and format support depends on the model (video requires a compatible Gemini model). No universal socket bypasses provider format/size limits.

Output rendering discovers actual file/job references and links inside nested multi-output results. Generated inline files become durable downloadable references with the same existing five-file / 1 MB total generation budget across the whole result. Stored image/video files can be previewed and downloaded. External source links open separately; they are not falsely presented as archived local files. Large generated media uses the existing asynchronous job/archive path.

Inspect a block's **Data** tab for addressed request/response metadata and the real input/output. The owner run/session record remains protected by the existing access checks. No real paid provider request is needed to test routing.
