export function createWorkManagement({
  api,
  sendJSON,
  modal,
  el,
  button,
  field,
  refresh,
  getData,
  onSelect,
  onAutomation,
}) {
  const terminal = (j) => ["completed", "cancelled"].includes(j.state);
  async function control(job, action) {
    const latest = (await api("company/jobs/" + job.id)).job;
    if (terminal(latest)) return;
    await sendJSON("company/jobs/" + job.id + "/control", {
      revision: latest.revision,
      action,
    });
    await refresh();
  }
  function confirmClear(jobId, back) {
    modal("Clear chat history", (host) => {
      host.append(
        el(
          "p",
          "This removes chat messages from the conversation. Tasks, workflow inputs, results, connections and schedules remain. This cannot be undone.",
        ),
      );
      host.append(
        button(
          "Delete chat messages",
          async () => {
            await api("company/messages", {
              method: "DELETE",
              body: JSON.stringify({ jobId }),
            });
            await refresh();
            await back();
          },
          "danger-button dialog-save",
        ),
      );
    });
  }
  async function open(mode = "work", offset = 0, prior = []) {
    await refresh();
    const data = getData();
    const page =
      mode === "work"
        ? await api("company/work-history?offset=" + offset)
        : null;
    modal("Work manager", (host) => {
      const tabs = el("nav", "", "manager-tabs");
      for (const [key, label] of [
        ["work", "Tasks"],
        ["automation", "Automation"],
        ["chat", "Chat history"],
      ]) {
        const b = button(
          label,
          () => open(key),
          "quiet-button" + (mode === key ? " selected" : ""),
        );
        b.setAttribute("aria-pressed", String(mode === key));
        tabs.append(b);
      }
      host.append(tabs);
      if (mode === "chat") {
        host.append(
          el(
            "p",
            "Open a task to read its conversation. Clearing chat does not stop work.",
          ),
        );
        host.append(
          button(
            "Clear all chat history",
            () => confirmClear(null, () => open("chat")),
            "danger-button",
          ),
        );
        const jobs = [
          ...new Map(
            (data.messages || [])
              .filter((m) => m.job_id)
              .map((m) => [
                m.job_id,
                data.jobs.find((j) => j.id === m.job_id) || {
                  id: m.job_id,
                  title: "Earlier work",
                },
              ]),
          ).values(),
        ];
        for (const j of jobs)
          host.append(button(j.title, () => chat(j), "manager-row-link"));
        if (!jobs.length) host.append(el("p", "No chat messages."));
        host.append(
          button("Browse all tasks", () => open("work"), "quiet-button"),
        );
        return;
      }
      if (mode === "work") {
        const search = field(host, "Search tasks", "");
        const list = el("div", "", "manager-list");
        host.append(list);
        for (const j of [...prior, ...page.jobs]) {
          const row = el("article", "", "manager-row");
          row.dataset.search = (j.title + " " + j.state).toLowerCase();
          const link = button(
            j.title || "Untitled work",
            async () => {
              await onSelect(j.id);
              document.querySelector("#modal").close();
            },
            "manager-row-link",
          );
          row.append(
            link,
            el(
              "span",
              j.paused === "true" ? "Paused" : j.state.replaceAll("_", " "),
              "manager-state",
            ),
            el("time", new Date(j.updatedAt).toLocaleString()),
          );
          row.append(button("Chat", () => chat(j), "quiet-button"));
          if (!terminal(j))
            row.append(
              button(
                j.paused === "true" ? "Resume" : "Pause",
                async () => {
                  await control(j, j.paused === "true" ? "resume" : "pause");
                  await open("work");
                },
                "quiet-button",
              ),
              button(
                "Stop",
                async () => {
                  await control(j, "stop");
                  await open("work");
                },
                "quiet-button",
              ),
            );
          list.append(row);
        }
        search.oninput = () => {
          for (const row of list.children)
            row.hidden = !row.dataset.search.includes(
              search.value.toLowerCase(),
            );
        };
        if (!list.children.length) list.append(el("p", "No tasks yet."));
        if (page.hasMore)
          host.append(
            button(
              "Load more tasks",
              () => open(mode, offset + 40, [...prior, ...page.jobs]),
              "quiet-button",
            ),
          );
      } else {
        const recipes = data.recipes.filter(
          (r) =>
            r.source === "verified-workflow" ||
            r.automation?.approvedAt ||
            r.automation?.enabled ||
            r.automation?.pauseReason,
        );
        if (!recipes.length)
          host.append(
            el(
              "p",
              "No verified automated workflows yet. Complete a real run, then configure Automation on that workflow.",
            ),
          );
        for (const r of recipes) {
          const row = el("article", "", "manager-row automation-row"),
            a = r.automation || {};
          const runs = data.jobs.filter((j) => j.recipeId === r.id);
          row.append(button(r.title, () => runHistory(r), "manager-row-link"));
          row.append(
            el(
              "span",
              a.enabled
                ? "Scheduled"
                : a.pauseReason
                  ? "Needs attention"
                  : "Off",
              "manager-state",
            ),
          );
          row.append(
            el(
              "p",
              a.enabled
                ? "Next: " +
                    new Date(a.nextRunAt || Date.now()).toLocaleString() +
                    " · every " +
                    a.intervalMinutes +
                    " min"
                : a.pauseReason || "Schedule disabled",
            ),
          );
          const toggle = async (enabled, stop = false) => {
            if (enabled && !a.intervalMinutes) {
              onAutomation(r);
              return;
            }
            const active = [];
            let offset = 0;
            while (true) {
              const page = await api(
                "company/work-history?active=true&automated=true&limit=100&offset=" +
                  offset +
                  "&recipeId=" +
                  r.id,
              );
              active.push(
                ...page.jobs.map((j) => ({
                  ...j,
                  paused: j.paused === "true",
                })),
              );
              if (!page.hasMore) break;
              offset += 100;
            }
            if (enabled)
              for (const j of active.filter((j) => j.paused))
                await control(j, "resume");
            await refresh();
            const fresh = getData().recipes.find((v) => v.id === r.id);
            await sendJSON(
              "company/recipes/" + r.id + "/automation",
              {
                ...a,
                revision: fresh.revision,
                enabled,
                preserveQueued: !stop,
              },
              "PUT",
            );
            if (!enabled)
              for (const j of active.filter((j) => !terminal(j)))
                if (stop || !j.paused)
                  await control(j, stop ? "stop" : "pause");
            await open("automation");
          };
          row.append(
            button("Play", () => toggle(true), "quiet-button"),
            button("Pause", () => toggle(false), "quiet-button"),
            button("Stop", () => toggle(false, true), "quiet-button"),
            button("Settings", () => onAutomation(r), "quiet-button"),
            button("Runs / results", () => runHistory(r), "quiet-button"),
          );
          if (runs[0])
            row.append(
              el("span", "Latest: " + runs[0].state.replaceAll("_", " ")),
            );
          host.append(row);
        }
      }
    });
  }
  async function runHistory(recipe, offset = 0, prior = []) {
    const page = await api(
      "company/work-history?recipeId=" + recipe.id + "&offset=" + offset,
    );
    modal("Workflow runs", (host) => {
      host.append(el("h3", recipe.title));
      for (const j of [...prior, ...page.jobs]) {
        const row = el("article", "", "manager-row");
        row.append(
          button(
            j.title,
            async () => {
              await onSelect(j.id);
              document.querySelector("#modal").close();
            },
            "manager-row-link",
          ),
          el("span", j.state.replaceAll("_", " ")),
          el("time", new Date(j.updatedAt).toLocaleString()),
        );
        host.append(row);
      }
      if (!page.jobs.length && !prior.length)
        host.append(el("p", "No runs yet."));
      if (page.hasMore)
        host.append(
          button(
            "Load more runs",
            () => runHistory(recipe, offset + 40, [...prior, ...page.jobs]),
            "quiet-button",
          ),
        );
    });
  }
  async function chat(job) {
    const result = await api("company/messages?jobId=" + job.id);
    modal("Chat history", (host) => {
      host.append(el("h3", job.title));
      for (const m of result.messages) {
        const item = el("article", "", "history-message");
        item.append(
          el("strong", m.role === "user" ? "You" : "Assistant"),
          el("p", m.content),
          el("time", new Date(m.created_at).toLocaleString()),
        );
        host.append(item);
      }
      if (!result.messages.length)
        host.append(el("p", "No chat messages for this task."));
      if (result.truncated)
        host.append(el("p", "Showing the most recent 500 messages."));
      host.append(
        button(
          "Clear this chat history",
          () => confirmClear(job.id, () => chat(job)),
          "danger-button",
        ),
      );
    });
  }
  async function editPlan(job) {
    const latest = (await api("company/jobs/" + job.id)).job;
    if (!latest.paused) {
      await control(latest, "pause");
      await onSelect(job.id);
      return;
    }
    modal("Edit workflow", (host) => {
      host.append(
        el(
          "p",
          "Edit pending blocks only. Completed or already-started blocks and results are protected. Saving keeps this run paused; Resume starts it again. Connection credentials belong in Connections.",
        ),
      );
      const title = field(host, "Workflow title", latest.title);
      const entries = [];
      for (const s of latest.steps) {
        const card = el("section", "", "plan-editor-card");
        card.append(el("h3", s.id + " · " + s.tool + " · " + s.state));
        const label = field(card, "Block title " + s.id, s.title),
          connection = field(card, "Connection " + s.id, s.connection || ""),
          args = field(
            card,
            "Inputs JSON " + s.id,
            JSON.stringify(s.args, null, 2),
            { rows: 6 },
          );
        for (const input of [label, connection, args])
          input.disabled = s.state !== "pending";
        entries.push({ s, label, connection, args });
        host.append(card);
      }
      host.append(
        button(
          "Save workflow",
          async () => {
            const steps = entries.map(({ s, label, connection, args }) => ({
              ...s,
              title: label.value,
              connection: connection.value || null,
              args: JSON.parse(args.value),
            }));
            await sendJSON(
              "company/jobs/" + job.id + "/plan",
              {
                revision: latest.revision,
                plan: { title: title.value, steps },
              },
              "PUT",
            );
            await refresh();
            await onSelect(job.id);
            document.querySelector("#modal").close();
          },
          "ink-button dialog-save",
        ),
      );
    });
  }
  return { open, control, editPlan };
}
