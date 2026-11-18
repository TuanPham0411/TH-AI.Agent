import { randomUUID } from "node:crypto";
import {
  assistantSystem,
  directorSystem,
  parseDecision,
  validatePlan,
  safePublicMessage,
  toolCatalog,
} from "../site/company-v2-model.js";
import { payloadHash, resolveToolStep } from "./company-v2-tools.js";
const preview = (value, max = 2000) => {
  if (value?.portability)
    return {
      portability: value.portability,
      projectHash: value.projectHash,
      root: value.root,
      folder: value.folder,
      sourceConnection: value.sourceConnection,
      dependencies: value.dependencies,
      warnings: value.warnings,
      entrypoint: value.entrypoint,
      localExecutionPerformed: value.localExecutionPerformed,
      files: value.files
        ?.slice(0, 3)
        .map((f) => ({ ...f, sourcePreview: f.sourcePreview?.slice(0, 300) })),
    };
  const text = JSON.stringify(value);
  return text && text.length > max
    ? {
        preview: text.slice(0, max),
        truncated: true,
        note: "Preview only; the full result remains available to deterministic tools and exports.",
      }
    : value;
};
export class CompanyRunner {
  constructor({ store, model, tool, getSecret }) {
    Object.assign(this, { store, model, tool, getSecret });
    this.busy = false;
    this.stopping = false;
  }
  async stop() {
    this.stopping = true;
    await this.processing;
  }
  async pause(job) {
    job.state = "queued";
    await this.update(job, "Work checkpointed for a worker restart");
  }
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      await this.store.recover();
      if (this.stopping) return;
      const job = await this.store.claim();
      if (job) {
        if (this.stopping) {
          await this.pause(job);
          return;
        }
        this.processing = this.work(job);
        await this.processing;
      }
    } finally {
      this.busy = false;
      this.processing = null;
    }
  }
  async update(job, message) {
    job.leaseUntil = Date.now() + 180000;
    if (message)
      job.events = [
        ...(job.events || []),
        { at: new Date().toISOString(), text: message },
      ].slice(-80);
    await this.store.save(job);
  }
  async wait(job, text, extra = {}) {
    job.state = "waiting_input";
    job.question = safePublicMessage(text);
    Object.assign(job, extra);
    await this.store.tx(async (db) => {
      await this.store.save(job, db);
      await this.store.say(job, job.question, db);
    });
  }
  async ask(job, slot, settings, context, system) {
    if (
      job.calls >=
      Math.min(settings.policy.maxCalls, job.automation?.maxCalls || 12)
    )
      throw Object.assign(
        Error(
          "The approved model-call budget is used up. Review the work and continue explicitly with a fresh allowance.",
        ),
        { budget: true },
      );
    const config = settings[slot];
    if (
      !settings.policy.allowPaid ||
      !(
        (await this.getSecret("company_ai_" + slot + "_" + config.provider)) ||
        (await this.getSecret(config.provider))
      )?.key
    )
      throw Object.assign(
        Error(
          "Open secure setup to configure the " +
            slot +
            " model and allow provider charges. Your request is saved.",
        ),
        { setup: true },
      );
    job.calls++;
    await this.update(
      job,
      slot === "assistant"
        ? "Assistant is understanding your request"
        : "Director is planning the next executable action",
    );
    let result;
    try {
      result = await this.model(
        {
          ...config,
          slot,
          system,
          messages: [{ role: "user", text: JSON.stringify(context) }],
          maxOutputTokens: 6000,
          tools: [],
        },
        AbortSignal.timeout(90000),
      );
    } catch {
      throw Object.assign(
        Error(
          "I could not reach the " +
            slot +
            " model. Check the saved key, selected model and provider billing in secure AI setup, then continue this request.",
        ),
        { setup: true },
      );
    }
    job.usage = [...(job.usage || []), { slot, ...result.usage }];
    return parseDecision(result.text);
  }
  async work(job) {
    try {
      let settings = await this.store.settings(),
        connections = await this.store.connections();
      if (job.phase === "assistant") {
        const recipes = await this.store.recipes(),
          history = (await this.store.messages())
            .filter((m) => m.job_id !== job.id)
            .slice(-12)
            .map(({ role, content }) => ({
              role,
              text: content.slice(0, 2000),
            }));
        const answer = await this.ask(
          job,
          "assistant",
          settings,
          {
            request: job.request,
            conversation: history,
            recipes: recipes
              .slice(0, 30)
              .map(({ id, title, instructions }) => ({
                id,
                title,
                instructions: String(instructions || "").slice(0, 500),
              })),
            connections: connections.map(({ id, name, kind }) => ({
              id,
              name,
              kind,
            })),
          },
          assistantSystem,
        );
        if (
          typeof answer.reply !== "string" ||
          typeof answer.dispatch !== "boolean"
        )
          throw Error("The assistant response was not a valid decision.");
        job.language = ["vi", "en"].includes(answer.language)
          ? answer.language
          : job.language || "en";
        job.expectations = Array.isArray(answer.expectations)
          ? answer.expectations
              .filter((x) =>
                [
                  "publish",
                  "xlsx",
                  "csv",
                  "json",
                  "report",
                  "data",
                  "media",
                  "server_tool",
                ].includes(x),
              )
              .slice(0, 6)
          : [];
        await this.store.say(job, safePublicMessage(answer.reply));
        if (!answer.dispatch) {
          job.state = "completed";
          job.phase = "conversation";
          await this.update(job);
          return;
        }
        job.brief =
          typeof answer.request === "string" && answer.request.trim()
            ? answer.request.slice(0, 16000)
            : job.request;
        job.recipeId = recipes.some((r) => r.id === answer.recipeId)
          ? answer.recipeId
          : null;
        job.phase = "director";
        await this.update(job);
      }
      for (
        let cycle = 0;
        cycle <
        Math.min(settings.policy.maxCalls, job.automation?.maxCalls || 12) + 1;
        cycle++
      ) {
        if (this.stopping) {
          await this.pause(job);
          return;
        }
        settings = await this.store.settings();
        connections = await this.store.connections();
        if (job.phase === "director") {
          const recipe = job.recipeId
            ? (await this.store.recipes()).find((r) => r.id === job.recipeId)
            : null;
          const decision = await this.ask(
            job,
            "director",
            settings,
            {
              request: job.brief || job.request,
              scheduleContext: job.automation
                ? {
                    scheduledAt: job.automation.scheduledAt,
                    timezone: "Asia/Ho_Chi_Minh",
                  }
                : null,
              answers: (job.answers || [])
                .slice(-8)
                .map((a) => a.slice(0, 2000)),
              skills: settings.skills.map((s) => ({
                ...s,
                description: s.description.slice(0, 1500),
              })),
              connections: connections.map(
                ({
                  id,
                  name,
                  kind,
                  dialect,
                  accountId,
                  action,
                  description,
                  effect,
                  mediaType,
                }) => ({
                  id,
                  name,
                  kind,
                  dialect,
                  accountId,
                  action,
                  description,
                  effect,
                  mediaType,
                }),
              ),
              recipe: recipe
                ? {
                    ...recipe,
                    instructions: String(recipe.instructions || "").slice(
                      0,
                      4000,
                    ),
                    procedure: recipe.procedure?.map((s) => ({
                      ...s,
                      input: preview(s.input, 1000),
                    })),
                  }
                : null,
              expectedDeliverables: job.expectations || [],
              inspectionEvidence: (job.inspectionEvidence || []).map((e) => ({
                ...e,
                result: preview(e.result, 4000),
              })),
              nextStepNumber:
                1 +
                Math.max(
                  0,
                  ...job.steps
                    .filter((s) => s.state === "completed")
                    .map((s) => Number(s.id.split("-")[1]) || 0),
                ),
              confirmedSteps: job.steps
                .filter((s) => s.state === "completed")
                .map(({ id, title, result }) => ({
                  id,
                  title,
                  result: preview(result),
                })),
            },
            directorSystem,
          );
          if (decision.action === "ask") {
            await this.wait(
              job,
              decision.message || "What outcome should I deliver?",
              {
                needs: {
                  kind: decision.connectionKind || null,
                  name: decision.connectionName || "",
                  skill: decision.skillProposal || null,
                },
              },
            );
            return;
          }
          if (decision.action === "inspect") {
            const conn = connections.find((c) => c.id === decision.connection);
            if (
              job.automation &&
              !job.automation.scope.some(
                (s) =>
                  s.tool === "query" && s.connection === decision.connection,
              )
            )
              throw Error(
                "Schema inspection is outside the approved automation scope.",
              );
            if (
              !conn ||
              ![
                "odbc",
                "postgres",
                "mysql",
                "sqlserver",
                "oracle",
                "mongo",
                "firestore",
              ].includes(conn.kind)
            )
              throw Error(
                "Choose a configured database for schema inspection.",
              );
            if ((job.inspectionEvidence || []).length >= 2)
              throw Error(
                "Schema inspection needs a more specific table or scope.",
              );
            await this.update(
              job,
              "Inspecting actual schema before building the query",
            );
            const result = await this.tool(
              {
                tool: "query",
                connection: conn.id,
                args: {
                  query: decision.query,
                  parameters: decision.parameters || [],
                  limit: 100,
                },
              },
              {
                connections,
                steps: job.steps,
                signal: AbortSignal.timeout(20000),
              },
            );
            job.inspectionEvidence = [
              ...(job.inspectionEvidence || []),
              { connection: conn.id, query: decision.query, result },
            ];
            await this.update(job, "Schema evidence received");
            continue;
          }
          if (decision.action !== "plan")
            throw Error(
              "The Director did not provide a plan or clarification.",
            );
          const plan = validatePlan(decision.plan, {
            connections,
            skills: settings.skills,
            offset: Math.max(
              0,
              ...job.steps
                .filter((s) => s.state === "completed")
                .map((s) => Number(s.id.split("-")[1]) || 0),
            ),
          });
          if (job.automation) {
            const sequence = [
              ...job.steps.filter((s) => s.state === "completed"),
              ...plan.steps,
            ];
            if (
              sequence.length > job.automation.scope.length ||
              sequence.some(
                (s, i) =>
                  s.tool !== job.automation.scope[i]?.tool ||
                  s.connection !== job.automation.scope[i]?.connection,
              )
            )
              throw Error(
                "The new plan changes the approved automation sequence or action count. Review a new workflow version before continuing.",
              );
          }
          job.title = plan.title;
          job.steps = [
            ...job.steps.filter((s) => s.state === "completed"),
            ...plan.steps,
          ];
          if (job.steps.length > 24)
            throw Error("This request needs a narrower workflow.");
          job.phase = "execute";
          job.needs = null;
          await this.update(
            job,
            "Workflow ready · " + plan.steps.length + " executable steps",
          );
          await this.store.say(
            job,
            safePublicMessage(
              decision.message ||
                "I have the plan and am starting the connected tools.",
            ),
          );
        }
        if (job.phase === "execute") {
          for (const step of job.steps) {
            if (this.stopping) {
              await this.pause(job);
              return;
            }
            if (step.state === "completed") continue;
            const current = await this.store.get(job.id);
            if (current?.state === "cancelled") return;
            connections = await this.store.connections();
            const connection = connections.find(
              (c) => c.id === step.connection,
            );
            const effective = resolveToolStep(step, job.steps),
              effect =
                step.tool === "bridge"
                  ? connection?.effect || "write"
                  : toolCatalog[step.tool].effect;
            if (job.automation && step.tool === "bridge") {
              const pinned =
                job.automation.scope[job.steps.indexOf(step)]?.toolId;
              if (pinned && effective.args.input?.toolId !== pinned)
                throw Error(
                  "The server tool version differs from the automation approval.",
                );
            }
            if (
              job.automation &&
              connection?.kind === "bridge" &&
              (connection.execution !== "server" ||
                !connection.unattended ||
                !connection.verifiedAt ||
                (connection.action === "run_python_tool" &&
                  !connection.pythonImageReady))
            )
              throw Error(
                "This tool depends on a laptop or an unverified unattended environment. Independent automation is paused.",
              );
            if (
              job.automation &&
              connection &&
              job.automation.scope.find(
                (s) => s.tool === step.tool && s.connection === step.connection,
              )?.connectionRevision !== connection.revision
            )
              throw Error(
                "An automation connection changed. Review and re-enable its approved scope.",
              );
            if (["write", "paid"].includes(effect) && !step.result?.jobId) {
              const hash = payloadHash(effective, connection);
              if (
                step.approvedHash !== hash &&
                !(effect === "paid"
                  ? connection?.allowMedia || job.automation?.allowMedia
                  : connection?.allowPublish ||
                    connection?.allowWrites ||
                    job.automation?.allowWrites)
              ) {
                job.state = "waiting_approval";
                job.approval = {
                  stepId: step.id,
                  hash,
                  title: step.title,
                  connection: connection?.name || step.connection,
                  payload: effective.args,
                };
                job.question =
                  (step.tool === "media"
                    ? "Media generation may incur provider charges. Approve this exact request for "
                    : "The content is ready. Approve this exact publication for ") +
                  (connection?.name || "the selected destination") +
                  ".";
                await this.store.tx(async (db) => {
                  await this.store.save(job, db);
                  await this.store.say(job, job.question, db);
                });
                return;
              }
            }
            step.state = "executing";
            await this.update(job, "Executing · " + step.title);
            let result;
            try {
              result = await this.tool(effective, {
                connections,
                steps: job.steps,
                signal: AbortSignal.timeout(60000),
              });
            } catch (error) {
              step.state = error.uncertain ? "uncertain" : "blocked";
              if (error.uncertain) {
                job.state = "uncertain";
                job.question = safePublicMessage(error.message);
                await this.store.tx(async (db) => {
                  await this.store.save(job, db);
                  await this.store.say(job, job.question, db);
                });
                return;
              }
              throw error;
            }
            if (result?.pending) {
              step.result = result;
              step.state = "waiting_external";
              job.state = "queued";
              job.nextAttemptAt = Date.now() + 15000;
              await this.update(
                job,
                "Waiting for the media provider; submission is saved and will not repeat",
              );
              return;
            }
            if (result?.files && result?.output) {
              await this.store.tx(async (db) => {
                for (const file of result.files)
                  await db.query(
                    "INSERT INTO files(id,path,size,type,name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING",
                    [file.id, file.path, file.size, file.type, file.name],
                  );
                step.result = result.output;
                step.state = "completed";
                await this.store.save(job, db);
              });
            } else {
              if (JSON.stringify(result).length > 200000)
                throw Error(
                  "The result is too large for this workflow. Narrow the source/query.",
                );
              step.result = result;
              step.state = "completed";
              await this.update(job, "Confirmed · " + step.title);
            }
          }
          if (
            job.automation &&
            job.steps.filter((s) => s.state === "completed").length <
              job.automation.scope.length
          ) {
            job.phase = "director";
            job.answers = [
              ...(job.answers || []),
              "Complete the remaining approved automation steps in their saved order.",
            ];
            await this.update(job);
            continue;
          }
          const missing = (job.expectations || []).filter((expectation) =>
            expectation === "server_tool"
              ? !job.steps.some(
                  (s) =>
                    s.result?.verifiedRun === true &&
                    s.result?.execution === "server",
                )
              : expectation === "publish"
                ? !job.steps.some((s) => s.result?.receipt)
                : expectation === "media"
                  ? !job.steps.some((s) => s.result?.mediaUrls?.length)
                  : expectation === "data"
                    ? !job.steps.some((s) => Array.isArray(s.result?.rows))
                    : expectation === "report"
                      ? !job.steps.some(
                          (s) => s.tool === "report" && s.result?.files?.length,
                        )
                      : !job.steps.some((s) =>
                          s.result?.files?.some((f) =>
                            f.name.endsWith("." + expectation),
                          ),
                        ),
          );
          if (missing.length) {
            job.phase = "director";
            job.answers = [
              ...(job.answers || []),
              "The expected deliverables are still missing: " +
                missing.join(", ") +
                ". Complete remaining work only.",
            ];
            await this.update(
              job,
              "Checking requested deliverables · remaining " +
                missing.join(", "),
            );
            continue;
          }
          job.recipeId ||= randomUUID();
          job.state = "completed";
          job.phase = "delivered";
          job.approval = null;
          job.result = {
            summary: job.title,
            files: job.steps.flatMap((s) => s.result?.files || []),
            receipts: job.steps
              .filter((s) => s.result?.receipt)
              .map((s) => s.result),
            steps: job.steps.length,
            assessments: job.steps
              .filter((s) => s.tool === "inspect_python")
              .map((s) => ({
                portability: s.result?.portability,
                projectHash: s.result?.projectHash,
                dependencies: s.result?.dependencies,
                warnings: s.result?.warnings,
                localExecutionPerformed: s.result?.localExecutionPerformed,
              })),
            stagedTools: job.steps
              .filter((s) => s.tool === "stage_python")
              .map((s) => s.result),
          };
          await this.store.tx(async (db) => {
            await this.store.save(job, db);
            await this.store.say(
              job,
              (job.language === "vi"
                ? "Tôi đã nhận kết quả xác nhận cho các bước: "
                : "The workflow returned confirmed results: ") +
                job.steps.map((s) => s.title).join("; ") +
                "." +
                (job.result.receipts.length
                  ? job.language === "vi"
                    ? " Đã có biên nhận đăng bài."
                    : " Publication receipt received."
                  : "") +
                (job.result.files.length
                  ? job.language === "vi"
                    ? " Các tệp kết quả đã sẵn sàng bên dưới."
                    : " Your files are ready below."
                  : ""),
              db,
            );
            const recipe = {
              title: job.title,
              language: job.language || "en",
              instructions: job.brief || job.request,
              procedure: job.steps.map((s) => ({
                title: s.title,
                skill: s.skill,
                tool: s.tool,
                connection: s.connection,
                ...(s.tool === "bridge" && s.result?.toolId
                  ? {
                      toolId: s.result.toolId,
                      verifiedServerRun: s.result.verifiedRun === true,
                      input: {
                        ...s.args.input,
                        toolFrom: undefined,
                        toolId: s.result.toolId,
                      },
                    }
                  : {}),
              })),
            };
            await db.query(
              `INSERT INTO company_recipes(id,value) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET value=company_recipes.value||excluded.value||jsonb_build_object('procedureVersion',coalesce((company_recipes.value->>'procedureVersion')::int,1)+1),revision=company_recipes.revision+1,updated_at=now()`,
              [job.recipeId || randomUUID(), JSON.stringify(recipe)],
            );
          });
          return;
        }
      }
      throw Object.assign(
        Error(
          "The workflow needs another bounded planning allowance to finish the requested deliverables.",
        ),
        { budget: true },
      );
    } catch (error) {
      await this.wait(
        job,
        error.setup
          ? error.message
          : error.budget
            ? error.message
            : "I kept your request and confirmed work. " +
              safePublicMessage(error.message) +
              " You can provide the missing information or correct the connection here, then continue.",
        {
          needs: error.setup
            ? { kind: "ai" }
            : {
                kind: error.connection ? "connection" : null,
                name: error.connection || "",
              },
          budgetUsed: !!error.budget,
        },
      );
    }
  }
}
