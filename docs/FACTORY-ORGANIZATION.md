# Factory organization

The User is the director. A factory workflow has one Manager and a checked, explicit reporting tree. Add it from **Blueprints → Start with a foundation → Factory organization**, or open **Organization → Convert this workflow to a factory hierarchy**. Conversion preserves IDs and saved block settings, changes the supported legacy Lead/Delegate connections locally, and requires Check/save. It never rewrites stored workflows in the background. A conversion with unsupported operational Flow attached to Manager stops with an actionable error.

## Positions and authority

- **Manager** receives user tasks and returns a final structured decision. It has no Flow or subordinate input. It chooses among staff recommendations, resolves their questions and reports confirmed outcomes/limitations, rather than forwarding questions or a menu of choices to the user. Runtime rejects question/option fields and invalid executive reports. Natural-language behavior also depends on the connected model; a blocked decision is displayed honestly rather than fabricated success.
- **Team Leader** analyzes its departmental objective, decomposes work among actual direct reports, receives their reports and returns a consolidated result to its assigning manager. Nested Leaders are supported with an eight-level execution bound and at most 15 direct reports per manager; larger groups must be split into departments.
- **Staff and operational blocks** can be independent Flow steps, direct user tasks or tools of their one direct manager. Supported channels can be enabled/removed under Connections. User-selected direct execution requires an enabled user input/result channel.
- **Supervisor / Reviewer** is a peer of Team Leaders, reports directly to Manager and assesses only actual peer Leader reports sent to that same Manager. It does not supervise staff or perform operational work. Observation and assessment connections are notifications, not recursive execution edges. It can approve, advise, reject or request more evidence. A rejected report is returned to Manager with a correction requirement; a new Leader assignment receives the actual assessment findings. Revision count is bounded (default 2, maximum 3). There is no automatic unlimited repair loop. Manager can ask for an additional assessment of an existing Leader report.

Every management model request includes the exact live roster: names, roles, capabilities, number of direct reports, number of execution/assessment staff, busy/available/waiting-for-Flow state, and remaining budget. Managers cannot invoke invented staff, skip levels or expand a role through prompt text.

## Channels

- **User**: text, JSON and existing private file/image/video references. The task recipient selector chooses Manager by default; other enabled workers can receive direct user commands. Existing provider modality/file-size limitations still apply.
- **Task ⇄ report**: Manager/Leader `tasks` to worker `manager`. One connection means an approved assignment in one direction and a correlated report back. Legacy attached Tool connections remain supported. Each model assignment needs an explicit `approved: true`; approval is bound to the immediate issuer and concrete task.
- **Controller**: Model, optional Memory and supported Tool controllers. These are configured/authenticated as before.
- **Flow**: carries exact data to the next connected worker's inbox. In factory mode it does not authorize execution: that next worker still requires a manager assignment, after upstream data is ready. Ordinary non-factory Flow workflows retain sequential branch execution. Conditions stage only the selected branch.
- **Observe**: Leader `report` to peer Supervisor/Reviewer `observe`.
- **Assessment**: Supervisor/Reviewer `assessment` to its Manager `assessment`. Assessment results are also included in the task report automatically.

Removing a channel with links asks to remove those links and invalidates the checked execution shape. Manager user channels are mandatory. Model/Memory/trigger/documentation/output blocks are infrastructure, not operational staff. Arbitrary invented channel names are not advertised as executable functions.

## Concurrency, approval and persistence

Independent model assignments can run in parallel: Manager can assign several Leaders in one turn, and each Leader can assign multiple staff. The entire run shares a bounded provider-IO limit (default 2, configurable 1–4). The isolated Function runner remains serialized because the Pi service supports one Function at a time. A worker cannot receive overlapping active tasks. Dependent Flow tasks are blocked until their real upstream input arrives. All concurrent outcomes are collected before returning a batch report, including failures.

Model turns still reserve the final turn for synthesis. Organization-wide model calls are separately bounded (default 24, configurable 2–40); final executive capacity is reserved where possible. Timeout defaults to 300 seconds, configurable 60–600; existing non-factory runs retain 180 seconds. Provider timeouts, API permissions, role capabilities and approved Auto quotas continue to apply.

Before an external write, publish, destructive operation or cloud media submission, TH-Server persists an approval receipt tied to task ID, direct manager, input SHA-256, run/workflow ID and execution fingerprint. Drive-first storage must acknowledge that receipt before the operation is called. Manager authority cannot replace the user's run-level write, paid-provider or destructive-operation permissions. Pure calculations/reading keep intermediate data in bounded RAM, with the existing final durable checkpoint. Products are actual operation outputs/file or media-job references, not invented model URLs.

Run Output includes the actual task/approval ledger, returned reports and assessments. Execution trace includes task IDs, manager/approval identity, phases and real timings. Task/observation edges animate only from real activity. The Organization console shows direct-report counts and review outcomes. A blocked/rejected task cannot silently become an all-complete executive status. Unattended Auto pauses after a partial/blocked organization result for review; no uncertain external write is automatically replayed.

No paid providers or external publishing are enabled by creating the template. Check the graph, verify saved connections and approve the desired run scopes before execution. The implementation is an orchestration layer over actual connected services; it does not provide unlimited model context, guaranteed semantic correctness or unconfigured platform permissions.

## Updated business templates and procedures

All 13 business blueprints now create a Manager → Operations Leader → Approved Procedure by default. Supervisor is optional: Manager explicitly self-assesses when no active Supervisor/Reviewer is assigned. The original deterministic Flow, conditions, freshness/consent gates, idempotency claims, JSON validation and publisher receipts remain inside the procedure. This keeps safety checks executable rather than turning every small step into a paid model decision. Management models add inference calls; **Create classic Flow** remains available when no hierarchy or management-model overhead is wanted.

The canvas starts with an organizational overview. Select the procedure and choose **Open approved procedure** to configure its real blocks; **← Organization** returns to the overview. Scope membership can be edited by name and is validated before Check/save. New operational blocks added inside a procedure are assigned to that procedure controller. Invalid membership, nested managers/procedures, missing trigger/output or broken ownership stops execution.

Procedure execution uses the exact checked payload and original Director input. A model cannot replace consent, event IDs, payment state or source evidence by supplying alternate task data. Every external effect records a receipt under the actual scoped controller, correlated to the execution trace step. Nested model requests share the organization budget; Function calls share the isolated runner. Partial steps are reported if a later operation fails, and an uncertain external write is not automatically replayed. The required procedure must actually finish before Manager may claim completion.

Existing saved Flow can be preserved with **Organization → Wrap this Flow as an approved procedure**; its nodes/settings/IDs stay intact and schedules are disabled until reviewed. The earlier inline conversion remains available for a compatible Lead/Delegate workspace. Conversion only changes the local draft until Check/save.
