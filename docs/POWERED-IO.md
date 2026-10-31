# Powered data I/O

Every operational data card displays one bidirectional point for each I/O type by default. Each type can have zero to three points. Pure Model/Memory infrastructure keeps only its existing controller sockets:

- **I/O · Tool** carries internal Flow data, approved tasks, returned reports, observations and assessments.
- **I/O · User** carries direct user requests and responses. Chat/Output bridges use this socket. Requests may combine text, structured JSON, stored image/video/document references and HTTP(S) links. Stored output files have download/preview controls.

**Model and Memory remain dedicated controllers. Callable Tool connections now share I/O · Tool** while keeping the same attached-tool list, credential checks, role capabilities and execution approvals. Legacy Tool edges render on the shared I/O socket automatically. A universal data socket does not grant role permissions or turn an infrastructure block into an operational step. Notes remain documentation without executable sockets.

Click two matching I/O sockets. When multiple directions/branches/purposes are possible, choose the route explicitly. Multiple logical routes share one physical socket. Their exact block IDs, direction and branch purpose remain in the saved graph; existing workflows and all templates display the new sockets automatically without rewiring, rewriting configuration or enabling schedules. Connections lists the multiplexed routes; advanced capabilities control supported logical channels. Controller links are listed separately.

## Addressing and fan-in

The executor creates routing metadata outside user/model payloads. Every message has a unique message ID, run request ID, session ID (when available), source and destination block/socket, logical route, edge ID and optional parent message ID. Responses reverse the exact source/destination and include `replyTo`. Metadata from another executor or a forged object cannot form a response. This is per-run local routing, not an Internet webhook or public message bus.

Classic Flow fan-out/fan-in executes each selected route separately; multiple Output deliveries remain individually identifiable. Managed Flow inputs are queued instead of last-write overwrites. On direct-manager-approved execution, the worker receives `flow` (one value or an array for a batch) and `flowInputs` (message/source/edge/value entries). Each consumed message receives its own correlated acknowledgement. Managers see pending input message/source IDs in the roster. An acknowledgement confirms the block returned; it does not independently prove an external provider action succeeded. Failed/uncertain operations are never automatically replayed.

A single physical socket can accept many links while logical safeguards still apply: one direct manager, one selected model/memory controller, no unauthorized controller rerouting, valid branch types, bounded execution and required write/paid approvals. Choosing the user socket cannot bypass Manager/Supervisor role rules.

## User media

Use **Attach files**, drag/drop or paste for stored media, and **Add link** for up to ten HTTP(S) references without embedded credentials. Adding a link does not fetch it: a search/web/service block must be explicitly configured to retrieve content. Up to five files per request, 16 MB each for storage; model inline input remains 6 MB total and format support depends on the model (video requires a compatible Gemini model). No universal socket bypasses provider format/size limits.

Output rendering discovers actual file/job references and links inside nested multi-output results. Generated inline files become durable downloadable references with the same existing five-file / 1 MB total generation budget across the whole result. Stored image/video files can be previewed and downloaded. External source links open separately; they are not falsely presented as archived local files. Large generated media uses the existing asynchronous job/archive path.

Inspect a block's **Data** tab for addressed request/response metadata and the real input/output. The owner run/session record remains protected by the existing access checks. No real paid provider request is needed to test routing.


## Configurable socket layout and automatic relationships

Open a block → **Connections → Socket layout**. Choose 0–3 points **per type** (0–6 data points total); each point can be placed on Left, Right, Top or Bottom. Round USB icons identify data points: U1–U3 for User, T1–T3 for Tool. Multiple routes may share any point. Pure Model/Memory infrastructure keeps its dedicated sockets, and Notes has none. Unused Model/Memory sockets can also be hidden or moved to a chosen edge.

A used point cannot be hidden. Select its wire and change the source/target attachment point, or deliberately remove the route, before lowering the count. `edge.ioPoints.source/target` are stable zero-based physical addresses; missing values default to point 0 for existing workflows. The backend validates count/side/index and refuses dangling hidden routes. Requests/replies retain the selected endpoint index as well as the exact node, run/session and message ID. Moving sockets or wires does not change the execution fingerprint, logical permissions, role or saved credentials. Changing actual channels/routes still requires Check/save.

Tool call and task/report are working modes on the same I/O Tool socket. In a classic Flow, **Call tool** attaches the provider to an agent's callable tool list; the agent decides whether to invoke it. In a factory workflow, **Assign task** establishes direct management and its durable approval/reporting path. Flow remains a selected data dependency, not execution permission. Choose the intended mode when more than one is possible; unique routes connect immediately. Model/Memory remain excluded from data routing.

**Detected working relationships** derives role, direct manager/caller, hierarchy depth, direct reports, callable tools, data suppliers/consumers and peer supervision from current logical connections. All AI agent requests receive this graph-derived context, with active/configured report counts distinguished. Rewiring/removing a route recalculates it without a stale stored role map. It does not silently change a specialist's selected role, grant extra capabilities, promote a block to Manager or permit a Supervisor to execute operations. Deterministic blocks use the actual approved caller context and correlated trace rather than pretending to interpret natural-language instructions.
