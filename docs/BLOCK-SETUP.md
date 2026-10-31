# Block setup reference

Every available block now has a **Setup checklist** in Configuration. It combines the actual provider setup instructions, required fields/scopes, current connection state, static input example, supported channels, execution/reporting behavior, settings reference, cost guidance and troubleshooting. The interface stays entirely English.

1. Choose the operation and a meaningful block name.
2. Configure real record/account IDs, model IDs, mappings and rules. References such as `{{input.field}}` must resolve against actual incoming Data.
3. Save authentication under Connections; do not place API keys in System instructions, notes, examples or exported JSON. Provider billing, project/model access, consent scopes and app reviews remain external prerequisites.
4. Choose System instructions for an AI position; Tool description advertises its capability to the assigning agent. Operational notes are documentation only.
5. Inspect **Connections**: user/task inputs, optional Flow data, supported Model/Memory controllers and I/O Tool callable-tool routes and user/manager/Flow outputs. Supers/Reviewers are peers of Leaders and assess only their reports for the shared Manager.
6. Use **Fill missing defaults** only for absent configuration values. It preserves configured values and never replaces credentials, grants approval or enables Auto.
7. Check/save the exact graph and conduct a small explicitly approved test. Inspect Data, task/approval ledger, reports and actual provider receipts. A green connection badge is not proof of every operation or model permission.

## Templates

Blueprint Library defaults to factory organization. Open its procedure to configure the preserved technical Flow. Existing original Flow mode is available as **Create classic Flow · no management model overhead**. Foundation templates remain available for individual experiments and free local Function previews.

Content templates keep separate production and Campaign Delivery workflows with the same campaign ID. A media job ID means submission, not a finished image/video. Sales event templates default to missing/false consent and IDs; they cannot mutate orders from empty input. Partner marketplace scope, per-channel posting review and account IDs must be supplied. Ads remain PAUSED, WordPress remains draft and private/SELF_ONLY defaults remain unchanged.

## Limits and failures

The inspector shows the actual workflow deadline: 180 seconds for classic Flow; organization defaults to 300 seconds (configurable 60–600). API deadlines depend on the provider/operation and can reach 120 seconds; media submission/polling has separate semantics. Provider IO is bounded; a Function runner is serialized. There is no automatic write replay.

A saved credential is not necessarily verified. A read-only free account probe can verify some connections; providers without one require an explicitly approved paid run. HTTP 401/403 can indicate key/project permissions, billing, eligibility, regional/network restrictions or an incompatible API—not only an empty balance. Inspect the provider's own console/playground and preserve the error context without sharing secrets.

Managed failures return a correlated report to the direct manager. Supervisor rejection returns an actual Leader correction request. When no active supervision is assigned, Manager evaluates the reports itself. Missing approvals, stale Flow data and blocked procedure gates do not become completed actions. Check the exact destination after uncertain writes before manually retrying.

## Powered data sockets

Data I/O is multiplexed into **I/O · Tool** (internal tasks/data/reports) and **I/O · User** (direct requests/results). Both are bidirectional and accept multiple routes. Select a route purpose if ambiguous. Callable tools share I/O · Tool; Model and Memory remain dedicated. Configure 0–3 points per I/O type and each point’s edge in Socket layout. Used points must be reattached or disconnected before hiding. Detected working relationships derives hierarchy and contracts from the current graph. Existing templates/workflows render the new sockets without configuration migration. See [Powered I/O](POWERED-IO.md) for addressing, fan-in and media limits.
