# Director meetings and recovery

Meet the Director opens a durable executive meeting room. Each planning task also has its own meeting. The CEO can discuss requirements, missing information, roles, staffing and Office settings without using separate organization forms. Conversations and proposals are private to the signed-in owner.

When no planning provider is connected or verified, deterministic setup guidance names the selected provider/model, explains what is missing and offers practical steps. It is explicitly labelled setup guidance: it is not presented as a successful AI call. The brief, partial HR answers and direction stay saved. Missing answers become a request for the remaining information, not a terminal error. Buttons remain usable after rejected requests.

A protected setup form inside the meeting can save an AI API key, test the saved connection, list accessible models and propose an Office provider/model change. The password field uses the existing protected credentials endpoint, clears after submission and is never appended to chat or model context. Recognizable credential formats are rejected in chat before persistence or a model call. Keys should always use the protected field, not ordinary conversation text.

## Reviewable changes

A paid Director message can discuss the task or propose typed changes to company policy, director/HR profiles, department heads, positions, capacities, allowed tools, planning/execution provider/model and runtime limits. It can propose an amended unapproved brief/data, or a new assignment from the general meeting room. Unknown configuration paths, credentials, OS operations and unsupported administrative settings cannot be applied through a model proposal.

The response shows the exact before/after changes. Apply these changes confirms that specific proposal. The server revalidates the full configuration, checks the Office revision and commits Office/task changes atomically. Repeated application is idempotent. Stale proposals require another review. An approved workflow is never silently edited: new settings affect subsequent plans, and changed work needs a follow-up brief.

The meeting includes controls to answer HR, continue planning, review staffing and tool configuration, confirm workflow creation and approve a run. These use the same authoritative planning/approval/run APIs as the task workspace. Cost approval, write permissions and acknowledgement of previous external effects remain explicit. A conversational request or settings proposal never grants operational permissions by itself.

## Persistence, fees and interruptions

Each paid meeting message reserves one attempt before calling the provider. Stable request IDs prevent an unknown network response from duplicating a paid message. Reported provider usage is included in My AI. Missing connection checks and queued notes do not call a paid model. A provider failure returns conversational guidance about access, model choice, quota, billing or retry options; authentication failures invalidate only the unchanged affected connection proof.

Additional notes can be saved while planning or a reply is in flight. They do not cancel the active result, alter its approved input or start another paid call. After the current result, the CEO confirms how to incorporate the notes. Interrupted replies can be recovered after five minutes with acknowledgement of possible provider charges; recovery never automatically replays the request.

Meetings retain a bounded recent transcript (24 messages); model context uses the latest 12. Current organization settings, saved task data and the latest execution evidence are provided separately. The meeting has no direct business tools: publication, email, filesystem/network operations and workflow execution require reviewed workflow APIs and their normal permission checks.

Mobile meetings are read-only. Resizing an open company authoring dialog to mobile closes it; drafts and persisted discussion remain available for desktop continuation. Automatic polling does not reopen a dismissed dialog.

Validation uses real isolated PostgreSQL tests and browser/provider fixtures. Release verification does not submit paid provider calls, replace live keys or publish posts.

The Director can propose a linked follow-up from an approved task's own meeting. This preserves its approved workflow and records the parent task on the new brief. Execution blockers also expose an in-meeting question/action to review missing settings or information; retries still require acknowledgement of the prior run.
