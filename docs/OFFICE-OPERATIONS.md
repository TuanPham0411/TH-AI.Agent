# Office, planning and execution

The Organization Office is the CEO's configuration surface. It stores company policy, director and HR profiles, eight enableable departments, department-head profiles, specialist positions, capacities, approved tools, provider/model and execution limits. Profiles include job description, personal style and work skills. Saving uses a revision check; concurrent edits cannot silently overwrite each other.

A new brief contains the request, JSON, actual uploaded references and links. It does not require the CEO to manually select a team. One explicitly approved planning call lets the Coordinating Director and HR analyze the brief against the saved organization. HR clarification is a persisted question/answer conversation. Planning never invokes business tools. Connections and required settings are checked before an approval-ready plan is offered. Attachment references are not represented as inspected content.

The CEO reviews departments, headcounts, per-position assignments, deliverables, dependencies and exact tool configuration. Approval atomically creates one validated workflow and records the reviewed organization/plan snapshot. Repeated approval returns the same workflow. Changing the organization requires replanning an unapproved proposal; existing approved workflows retain their reviewed snapshot. A changed generated workflow requires a fresh approved plan before execution. Runtime model/media costs and external-write permissions remain separate from planning and plan approval.

The Execution Floor is the workflow's operational view: raised department stations, illustrated personnel workstations, reporting lines, dependencies, actual execution status and the selected person's profile/assignment. Run/check/save controls remain available. Advanced graph view and the block console remain available for detailed inspection; bottom instructions and right-side configuration retain their existing roles.

## Personnel cache and routing

Each generated person has a stable identity: director, reviewer, department head, or position/slot. Their current profile and reporting directory are stored in the approved graph. A per-person history cache stores the last six bounded assignments/results in private server storage; the latest three are supplied to that person. Role profile changes invalidate old history. Only that identity's private history is loaded. The read-only team_directory tool exposes approved profiles/reporting lines, never coworkers' private histories. HR planning history is separately persisted.

Caches are checkpointed in the same database transaction as execution results. A failed storage acknowledgement does not report the cache as saved. Historical context cannot grant permissions or justify replaying external writes. The CEO can inspect saved memory in Office positions and on the Execution Floor.

The runtime enforces direct-manager routing, active-task exclusion, upstream departmental dependencies, bounded budgets, and reuse of already-confirmed assignments within a run. Departments cannot claim completion before required specialists report; the director cannot claim completion without department reports and quality assessments. These controls do not guarantee model factual correctness or eliminate provider errors: concrete blockers, incomplete work and independent review remain visible.

## Limits and recovery

Organization limits allow up to eight departments and 24 specialists, subject to 100 graph blocks, 400 KB graph size, at most 14 direct reports/tools per department, and a six-to-40 model-call budget. The planner must choose a team that can fit the budget. Parallel work is limited to one-to-four tasks and execution to 60–600 seconds. Generated directors support bounded additional planning turns for department sequences.

Each planning brief permits at most eight explicitly approved provider calls. A reserved call is never silently retried. A crashed or unacknowledged attempt can be recovered after five minutes only after acknowledging possible provider charges. Recovery does not replay the call. Usage returned by planning providers is included in My AI; invoice totals remain available only through provider billing consoles.

No schema migration is required. Office, planning and personnel records use private `_studio_` namespaces in existing protected storage. Existing workflows, files and credentials are retained. Browser/model/provider tests use fixtures; release verification does not issue real paid calls or publish content.

The company shell uses an independently scrolling main pane. The sidebar and top bar remain fixed; short screens can scroll the sidebar separately. Mobile exposes organization/planning status as read-only; role design, HR answers and plan approval require a desktop.
