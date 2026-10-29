# TH Agent Studio: automation readiness assessment

This assessment describes implemented behavior rather than visual similarity or the number of catalog entries. Studio is a useful personal automation MVP. It is not yet equivalent to a mature production automation platform such as n8n.

| Area | Studio today | Improvement needed |
| --- | --- | --- |
| Visual authoring | Drag/drop nodes and connections, properties/configuration, previews, grouped toolbox, animation/traces, notes, full view, resizable/pinnable panels | Large-graph virtualization, accessibility review, reusable subflows, stronger data mapping and schema previews |
| Execution | Bounded directed workflows, role prompts, Functions in disposable restricted containers, single server worker, cancellation | Durable job queue, independent workers, recovery after restarts, checkpoints, fan-out/join semantics, long-running waits and event-driven continuation |
| Reliability | Revision conflicts, owner Drive-first acknowledgement, timer claims, explicit paid/write approval, uncertain-write warnings | Per-operation idempotency keys, configurable backoff/retries, dead-letter queue, reconciliation and repeatable recovery drills |
| Integrations | Service presets, real API adapters, generic add-ins, credential setup guides, Google/Microsoft connections | Connector-specific schemas, pagination/rate limits, webhook signature verification, OAuth refresh/revocation testing and maintained compatibility matrix. A catalog preset is not proof that every provider has been exercised with live credentials. |
| AI agents | Defined roles, model/tool connections, bounded delegation, media job tracking | Persisted plans, structured-output validation, evaluation datasets, cost budgets, permission scopes per tool and human approval checkpoints |
| Identity | Server-verified Google owner; separate Firebase Google members with approval, blocking and UID-specific draft storage | Isolated member execution, per-tenant secret vaults, organization roles, invitations, MFA/session revocation policies, account export/deletion |
| Operations | Health endpoints, traces/history, Docker deployment, TH-Server scheduling and owner recovery | Central metrics/logs, alerting, service-level objectives, load/chaos tests, tenant-level resource/cost limits |
| Commerce | Owner can label accounts Free/Pro/Business; no charges collected | Billing provider, signed/idempotent payment webhooks, entitlements, metering, quotas, privacy/retention policy and abuse handling |

## Development order

1. Finish real Firebase/Google configuration and test membership and rule isolation with two accounts. Keep registration on approval while testing.
2. Move execution to a durable queue with per-tenant jobs and isolated credentials. Never allow a registered user's graph to inherit owner connections.
3. Add idempotency, retry policy, checkpoint/resume, asynchronous media continuation and webhook verification.
4. Select a small number of connectors and test each end-to-end against real services, including pagination, expiry, rate limits and provider errors.
5. Add quotas, budgets, metrics, retention/export/deletion, immutable security audit and recovery drills.
6. Run a limited pilot and external security review. Add billing only when usage can be measured and enforced reliably.

## Hardware

The shared Raspberry Pi 3 Model B (about 1 GB RAM) is enough for personal design and light sequential cloud-API workflows. It is not a reasonable host for public multi-user workers, multiple databases, builds and video generation simultaneously. Memory pressure/swap and storage I/O reduce responsiveness and recovery headroom.

For a small public pilot, use at least 4 CPU cores, 8 GB RAM and SSD storage, with PostgreSQL and workers monitored independently. A Pi 5 with 8 GB and SSD can support a constrained pilot; a mini PC/VPS is easier to scale and supervise. This is a starting recommendation, not a capacity guarantee; establish limits with load tests. A dedicated machine helps isolate failures, but moving to another low-memory Pi alone does not solve queueing or tenancy design. Keep AI/video generation in cloud services unless a separate GPU machine is available.
