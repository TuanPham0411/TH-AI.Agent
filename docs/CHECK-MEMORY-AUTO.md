# Check, verified connections, Memory and Auto

## Prepare once

1. Configure each provider in Connections. Saved credentials remain server-side; workflow exports contain references and block settings, not credential secrets.
2. Use **Test saved access**, or **Check workflow**. Check performs structural/port/role checks, compiles Function syntax without executing it, and probes supported free provider endpoints. It saves the full workflow and check record through the existing durable owner store.
3. Check does not send mail, publish content, execute user Functions or issue billable model/media requests. Providers without a free probe (such as Perplexity) need an explicitly approved successful run to establish authentication proof.
4. A special green check marks a verified saved connection with configured block fields. Agent marks reflect connected models/tools. A local block's mark means static configuration was checked; it does not claim that arbitrary Function logic or every provider operation has been executed successfully.
5. Changing executable settings or master credentials invalidates the checked snapshot. Moving blocks or changing notes does not. A valid same-identity OAuth refresh preserves proof. Operation-specific permissions, quota, expiry and provider availability are still checked on actual use.

## Fast execution and Memory

The engine pre-indexes connections, reuses run-scoped credentials/add-ins, and uses bounded RAM for live traces, node data and conversation history. Short-lived access-token refreshes stay in RAM when the master refresh token/scopes are unchanged; rotated master credentials are durably saved.

The previous implementation awaited a durable trace write before and after every block. The new implementation uses a durable admission intent, processes steps in Memory, and commits final status/output/trace and authentication proofs in one final transaction. A 22-block test asserts two main durable transactions and one final trace update, rather than per-step Drive writes. This reduces persistence overhead; it is not a promise that a provider's own model generation becomes a fixed number of times faster.

Live telemetry is explicitly marked non-durable. A computed result can be displayed while its final checkpoint is pending; it is only marked saved/completed after acknowledgement. Failed checkpoints retry storage without replaying provider operations, and further runs wait rather than accumulating unsaved results. The native tick can retry a pending checkpoint. A server crash can lose in-progress RAM data; the durable admission remains and interrupted effects are not automatically replayed.

Live node inspection is bounded (four recent runs, up to about 4 MiB of cell data per run); old or oversized cells can be truncated/evicted. Persisted final output and bounded trace remain in run history. Conversation memory is isolated by workflow/session, keeps up to ten turns, and truncates long messages to the existing 4,000-character context budget. Auto uses its own `auto` session so successful cycles can use previous outcomes.

## Auto without an open browser

Open **Auto · TH-Server** after Check. Set the JSON goal/input, cycle interval and daily run limit. Approve specific paid model/tool blocks and, separately, external write/publishing blocks. Set attempted-call limits per run/day. Paid media generation needs its own permission. The final enable action persists the reviewed policy and binds it to the executable graph and current connections.

The native TH-Server supervisor checks due work every minute. One execution runs at a time on this Pi; missed cycles coalesce rather than building an unbounded backlog. AI managers choose among connected tools permitted by their role and the Auto policy. Optional tools outside the approved scope are hidden, and the backend still enforces the scope at invocation.

Daily limits use UTC. They cap attempts/reservations, not currency: model tokens, media and provider subscriptions have different prices. Worst-case run allowance is reserved atomically with admission, before requests are sent. Known unused reservations are released at the final checkpoint. After a crash, unaccounted reservations remain consumed conservatively.

Auto pauses for changed configuration/authentication, repeated failed cycles, or an incomplete cycle that attempted an external write/media job. Interrupted write-capable runs are not replayed after restart. Daily quota exhaustion waits for the next UTC day. Stop aborts current processing where possible and durably disables further cycles; an external operation already accepted by a provider cannot be undone automatically.

Built-in financial/deletion operations and unreviewed custom POST connectors are unavailable in Auto. Known reviewed service connectors (mail, tasks, documents, sheets, social publishing) still require explicit node-level write approval. Generic POST capability review and human approval workflows can be added later.

Auto starts disabled. Deployment does not activate paid operations or publish anything on the owner's behalf. Firebase members still cannot execute with the owner's credentials; this release's server Auto is owner-only. The shared Pi 3 remains a single worker, suitable for personal light workloads; production multi-user execution needs separate workers and stronger hardware.
