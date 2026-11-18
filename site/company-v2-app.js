import { attachModelPicker } from "./company-model-picker.js";
import { createExampleStudio } from "./workflow-example-studio.js";
import { createConnectionStudio } from "./company-connection-studio.js";
import { safeWorkLink } from "./company-v2-links.js";
import { defaultCompanySettings, jobStates } from "./company-v2-model.js";
import { companyScene } from "./company-v2-scene.js";
import { renderAnswer } from "./chat-answer.js";
import "./chat-answer.css";
import "./company-v2.css";
const el = (tag, text = "", cls = "") => {
    const n = document.createElement(tag);
    n.textContent = String(text).replaceAll("↗", "→");
    n.className = cls;
    return n;
  },
  button = (text, fn, cls = "") => {
    const b = el("button", text, cls);
    b.type = "button";
    b.onclick = () =>
      Promise.resolve(fn()).catch((error) => notice(error.message));
    return b;
  };
const state = {
    owner: false,
    data: null,
    selected: location.hash.startsWith("#work/")
      ? location.hash.slice(6)
      : null,
    requestId: null,
    draft: "",
    sending: false,
    reply: null,
    selectedStep: null,
    zoom: 1,
    fit: true,
    forceFit: false,
    example: null,
    requestRecipeId: null,
  },
  root = document.querySelector("#app");
const refreshWaiters = [];
let polling = false,
  pollTimer;
document.documentElement.dataset.theme = "light";
document.title = "TH / Company — One request. Real work.";
async function api(path, options = {}) {
  const response = await fetch("/api/" + path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
    signal: options.signal || AbortSignal.timeout(20000),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(value.error || "The service could not confirm this request.");
  return value;
}
const sendJSON = (path, value, method = "POST") =>
  api(path, { method, body: JSON.stringify(value) });
function notice(text) {
  const n = document.querySelector("#toast");
  n.textContent = text;
  n.className = "company-notice";
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => (n.textContent = ""), 7000);
}
function modal(title, build) {
  const d = document.querySelector("#modal");
  d.className = "";
  d.replaceChildren();
  const h = el("header");
  h.append(
    el("h2", title),
    button("×", () => d.close(), "close-modal"),
  );
  const content = el("div", "", "setup-content");
  d.append(h, content);
  build(content);
  d.showModal();
}
function field(
  host,
  label,
  value = "",
  { secret = false, options, type = "text", rows } = {},
) {
  const l = el("label", "", "company-field");
  l.append(el("span", label));
  const input = el(options ? "select" : rows ? "textarea" : "input");
  if (options) {
    for (const [v, t] of options) {
      const o = new Option(t, v);
      input.append(o);
    }
    input.value = value;
  } else {
    input.value = value;
    if (input.tagName === "INPUT") input.type = secret ? "password" : type;
    if (rows) input.rows = rows;
  }
  input.setAttribute("aria-label", label);
  if (secret) {
    input.autocomplete = "new-password";
    input.spellcheck = false;
  }
  l.append(input);
  host.append(l);
  return input;
}
function receiptElement(receipt) {
  const url = safeWorkLink(receipt.url, location.origin);
  const node = el(
    url ? "a" : "p",
    url
      ? "Open confirmed publication →"
      : (receipt.platform || "Service") +
          " · confirmed receipt " +
          (receipt.receipt || receipt.id),
    "service-receipt",
  );
  if (url) {
    node.href = url;
    node.target = "_blank";
    node.rel = "noopener noreferrer";
  }
  return node;
}
function jobLabel(job) {
  return job?.steps?.some((step) => step.state === "waiting_external")
    ? "Visual generation in progress"
    : job?.state === "example"
      ? "Example · setup required"
      : jobStates[job?.state] || "Standing by";
}
function current() {
  return (
    state.data?.jobs.find((j) => j.id === state.selected) ||
    state.data?.jobs[0] ||
    null
  );
}
function render() {
  const canvasScroll = document.querySelector(".work-canvas")?.scrollTop || 0;
  const focused = document.activeElement?.id === "assistant-input",
    selection = focused
      ? [
          document.activeElement.selectionStart,
          document.activeElement.selectionEnd,
        ]
      : null;
  const selected = state.example
      ? {
          ...state.example,
          recipeId: state.example.id,
          id: null,
          state: "example",
          phase: "example",
          steps: state.example.procedure || [],
        }
      : current(),
    replying =
      state.reply === true ||
      (state.reply === null &&
        ["waiting_input", "waiting_approval"].includes(selected?.state)),
    data = state.data,
    previous = document.querySelector(".conversation-log"),
    bottom =
      !previous ||
      previous.scrollHeight - previous.clientHeight - previous.scrollTop < 100,
    scroll = previous?.scrollTop || 0;
  root.replaceChildren();
  const shell = el("div", "", "company-desk"),
    header = el("header", "", "desk-header"),
    brand = button(
      "TH",
      () => {
        state.selected = null;
        state.example = null;
        render();
      },
      "desk-mark",
    ),
    name = el("div", "", "brand-name");
  name.append(
    el("strong", "TH / COMPANY"),
    el("span", "YOUR INTENT. OUR WORK."),
  );
  header.append(
    brand,
    name,
    el("span", "01 ASSISTANT  /  02 DIRECTOR", "two-minds"),
  );
  const nav = el("nav");
  if (state.owner)
    nav.append(
      button("Connections", () => connectionList(), "quiet-button"),
      button("Examples", () => exampleStudio.library(), "quiet-button"),
      button("Company setup", () => setup(), "quiet-button"),
    );
  nav.append(
    button(
      state.owner ? "Your workspace" : "Sign in",
      () => (state.owner ? account() : location.assign("/api/oauth/start")),
      "ink-button",
    ),
  );
  header.append(nav);
  shell.append(header);
  const main = el("main", "", "desk-main"),
    conversation = el("section", "", "assistant-desk"),
    ch = el("div", "", "assistant-heading");
  ch.append(
    el("span", "A DIRECT LINE", "eyebrow"),
    el("h1", "Consider it handled."),
    el(
      "p",
      "Tell your assistant what you need. We will bring back the work, or the one thing needed to keep it moving.",
    ),
  );
  conversation.append(ch);
  const log = el("div", "", "conversation-log");
  if (
    data?.recipes.some(
      (r) => r.source === "legacy-workflow" && r.legacyAutomationWasEnabled,
    )
  ) {
    const note = el("article", "", "action-card");
    note.append(
      el(
        "p",
        "Previous Studio schedules are retained but suspended under the old AI engine. Ask your assistant to prepare and verify the new version, then enable its Automation here.",
      ),
    );
    log.append(note);
  }
  log.setAttribute("aria-label", "Conversation with your assistant");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  if (!data?.messages?.length) {
    const intro = el("article", "", "assistant-message welcome-message");
    intro.append(
      el("span", "YOUR ASSISTANT", "message-label"),
      el(
        "p",
        state.owner
          ? "What would you like to get done? I can find a workflow, coordinate the tools, and keep you informed here."
          : "One conversation for your company. Sign in to connect your tools and turn a request into finished work.",
      ),
    );
    const examples = el("div", "", "starter-requests");
    for (const text of [
      "Find the 10-ADU8 documents in table A of odssg_vn and give me an Excel file.",
      "I’m feeling low. Create something thoughtful and post it to my Facebook Page.",
    ])
      examples.append(
        button(text, () => {
          state.draft = text;
          document.querySelector("#assistant-input").value = text;
          document.querySelector("#assistant-input").focus();
        }),
      );
    intro.append(examples);
    log.append(intro);
  }
  for (const m of data?.messages || []) {
    const item = el(
      "article",
      "",
      m.role === "user" ? "user-message" : "assistant-message",
    );
    item.append(
      el("span", m.role === "user" ? "YOU" : "YOUR ASSISTANT", "message-label"),
    );
    const copy = el("div");
    renderAnswer(copy, m.content);
    item.append(copy);
    if (m.job_id)
      item.append(
        button(
          "View this work ↗",
          () => {
            state.example = null;
            state.requestRecipeId = null;
            state.selected = m.job_id;
            history.replaceState(null, "", "#work/" + m.job_id);
            state.reply = null;
            state.selectedStep = null;
            render();
          },
          "message-work-link",
        ),
      );
    const linked = data?.jobs.find((j) => j.id === m.job_id);
    if (
      linked?.result &&
      m.role === "assistant" &&
      data.messages
        .filter((v) => v.job_id === m.job_id && v.role === "assistant")
        .at(-1)?.id === m.id
    ) {
      const files = el("div", "", "delivered-files");
      for (const f of linked.result.files || []) {
        const a = el("a", "↓ " + f.name);
        a.href = safeWorkLink(f.url, location.origin) || "#";
        a.download = f.name;
        files.append(a);
      }
      for (const receipt of linked.result.receipts || [])
        files.append(receiptElement(receipt));
      for (const assessment of linked.result.assessments || []) {
        const card = el("div", "", "assessment-result");
        card.append(
          el("strong", "Python portability · " + assessment.portability),
          el(
            "p",
            "Static inspection only. The project was not run on the laptop.",
          ),
          el(
            "p",
            "Dependencies: " +
              (assessment.dependencies?.join(", ") ||
                "standard library / local modules"),
          ),
        );
        for (const warning of assessment.warnings || [])
          card.append(el("p", warning));
        item.append(card);
      }
      for (const staged of linked.result.stagedTools || [])
        item.append(
          el(
            "p",
            "Server tool " +
              staged.toolId +
              " · " +
              (staged.verifiedRun
                ? "verified"
                : "staged; server test still required"),
          ),
        );
      const linkedRecipe = data.recipes.find((r) => r.id === linked.recipeId);
      if (linkedRecipe)
        files.append(
          button(
            linkedRecipe.automation?.enabled ? "Automation on" : "Automation",
            () => automation(linkedRecipe),
            "quiet-button",
          ),
        );
      item.append(files);
    }
    log.append(item);
  }
  if (
    selected &&
    ["waiting_input", "waiting_approval", "uncertain"].includes(selected.state)
  ) {
    const card = el("article", "", "action-card");
    card.append(
      el("span", jobStates[selected.state], "eyebrow"),
      el("p", selected.question || "I need one detail to continue."),
    );
    if (selected.state === "waiting_approval") {
      const payload = selected.approval?.payload || {},
        preview = el("div", "", "approval-preview");
      preview.append(el("strong", selected.approval?.connection || ""));
      if (payload.caption || payload.prompt)
        preview.append(el("blockquote", payload.caption || payload.prompt));
      if (payload.imageUrl) {
        const image = el("img");
        const imageURL = safeWorkLink(payload.imageUrl, location.origin);
        if (imageURL) image.src = imageURL;
        image.alt = "Prepared publication visual";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        preview.append(image);
      }
      if (payload.videoUrl) {
        const link = el("a", "Review prepared video →");
        link.href = safeWorkLink(payload.videoUrl, location.origin) || "#";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        preview.append(link);
      }
      const technical = el("details");
      technical.append(
        el("summary", "Exact action details"),
        el("pre", JSON.stringify(payload, null, 2)),
      );
      preview.append(technical);
      card.append(preview);
      card.append(
        button(
          {
            media: "Approve generation & charges",
            publish: "Approve this publication",
            stage_python: "Approve transfer to server",
            bridge: "Approve this tool action",
          }[
            selected.steps.find((s) => s.id === selected.approval?.stepId)?.tool
          ] || "Approve this action",
          () => respond("approve"),
          "ink-button",
        ),
        button("Stop this work", () => respond("cancel"), "quiet-button"),
      );
    } else if (selected.state === "uncertain") {
      card.append(
        el(
          "p",
          "Check the destination/provider first. A retry may duplicate a post or a paid media job.",
        ),
      );
      const ack = field(
        card,
        "I checked the external outcome and accept duplicate risk",
        false,
        { type: "checkbox" },
      );
      ack.checked = false;
      card.append(
        button(
          "Retry the unconfirmed action",
          () => {
            if (!ack.checked)
              throw Error(
                "Check the external outcome and acknowledge the risk first.",
              );
            return respond("retry", { acknowledgeDuplicateRisk: true });
          },
          "quiet-button",
        ),
        button(
          "Stop without retrying",
          () => respond("cancel"),
          "quiet-button",
        ),
      );
    } else {
      if (selected.needs?.kind === "ai")
        card.append(button("Secure AI setup", () => setup(), "ink-button"));
      else if (selected.needs?.kind && selected.needs.kind !== "connection")
        card.append(
          button(
            "Set up " + selected.needs.kind,
            () => connectionForm(null, selected.needs),
            "ink-button",
          ),
        );
      else
        card.append(
          button(
            "Open secure connections",
            () => connectionList(),
            "quiet-button",
          ),
        );
      if (selected.needs?.skill) {
        card.append(
          el("strong", selected.needs.skill.name),
          el("p", selected.needs.skill.description),
          button(
            "Add this skill position & continue",
            async () => {
              await sendJSON("company/jobs/" + selected.id + "/skill", {
                revision: selected.revision,
              });
              await refresh();
            },
            "ink-button",
          ),
        );
      }
      card.append(
        button(
          "Reply to this work",
          () => {
            state.reply = true;
            render();
            document.querySelector("#assistant-input").focus();
          },
          "quiet-button",
        ),
        button(
          selected.budgetUsed
            ? "Approve another bounded allowance & continue"
            : "Connection updated — continue",
          () =>
            respond("reply", {
              text: "Continue with the corrected setup.",
              approveNewBudget: selected.budgetUsed === true,
            }),
          "quiet-button",
        ),
      );
    }
    log.append(card);
  }
  conversation.append(log);
  const compose = el("form", "", "assistant-compose"),
    context = el("div", "", "compose-context");
  if (replying && selected) {
    context.append(
      el("span", "Replying to " + selected.title),
      button(
        "New request",
        () => {
          state.reply = false;
          render();
        },
        "text-button",
      ),
    );
    compose.append(context);
  }
  const input = el("textarea");
  input.id = "assistant-input";
  input.rows = 2;
  input.placeholder = replying
    ? "Tell me the missing detail…"
    : "What would you like me to take care of?";
  input.setAttribute("aria-label", "Message your assistant");
  input.value = state.draft;
  input.oninput = () => {
    state.draft = input.value;
    state.requestId = null;
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      compose.requestSubmit();
    }
  };
  const submit = el(
    "button",
    state.sending ? "Sending…" : "Send request →",
    "send-request",
  );
  submit.type = "submit";
  submit.disabled = state.sending;
  compose.append(
    input,
    submit,
    el(
      "small",
      "Passwords and API keys belong in secure connection cards, never in chat.",
    ),
  );
  compose.onsubmit = async (e) => {
    e.preventDefault();
    if (!state.owner) {
      location.assign("/api/oauth/start");
      return;
    }
    if (!state.draft.trim() || state.sending) return;
    state.sending = true;
    submit.disabled = true;
    try {
      if (replying && selected) await respond("reply", { text: state.draft });
      else {
        state.requestId ||= crypto.randomUUID();
        const response = await sendJSON("company/messages", {
          text: state.draft,
          requestId: state.requestId,
          ...(state.requestRecipeId ? { recipeId: state.requestRecipeId } : {}),
        });
        state.selected = response.job.id;
        history.replaceState(null, "", "#work/" + state.selected);
      }
      state.draft = "";
      state.example = null;
      state.requestRecipeId = null;
      state.requestId = null;
      state.reply = null;
      await refresh();
    } catch (error) {
      notice(error.message);
    } finally {
      state.sending = false;
      render();
    }
  };
  conversation.append(compose);
  const work = el("section", "", "work-desk"),
    wh = el("header", "", "work-heading");
  wh.append(el("div"));
  wh.firstChild.append(
    el("span", "THE WORK IN MOTION", "eyebrow"),
    el("h2", selected?.title || "Room for your next idea."),
  );
  wh.append(
    el(
      "span",
      selected ? jobLabel(selected) : "Standing by",
      "work-state " + (selected?.state || ""),
    ),
  );
  const recipe = data?.recipes.find((r) => r.id === selected?.recipeId);
  const operations = el("div", "", "workflow-controls");
  if (state.example)
    operations.append(
      button(
        "Workflow examples",
        () => exampleStudio.library(),
        "quiet-button",
      ),
    );
  if (recipe && !state.example)
    operations.append(
      button(
        recipe.automation?.enabled ? "Automation on" : "Automation",
        () => automation(recipe),
        "quiet-button",
      ),
    );
  if (selected?.id) {
    const tab = el("a", "Open work tab →", "quiet-button");
    tab.href = "/#work/" + selected.id;
    tab.target = "_blank";
    tab.rel = "noopener";
    operations.append(tab);
  }
  wh.append(operations);
  work.append(wh);
  const list = el("nav", "", "work-switcher");
  list.setAttribute("aria-label", "Recent work");
  for (const job of data?.jobs.slice(0, 12) || []) {
    const b = button(
      job.title,
      () => {
        state.example = null;
        state.requestRecipeId = null;
        state.selected = job.id;
        history.replaceState(null, "", "#work/" + job.id);
        state.selectedStep = null;
        state.reply = null;
        render();
      },
      job.id === selected?.id ? "selected" : "",
    );
    b.append(el("span", jobLabel(job)));
    list.append(b);
  }
  if (list.childNodes.length) work.append(list);
  const viewBar = el("div", "", "flow-toolbar");
  const counts = el("div", "", "flow-progress");
  counts.append(
    el(
      "strong",
      (selected?.steps.filter((s) => s.state === "completed").length || 0) +
        " / " +
        (selected?.steps.length || 0),
    ),
    el("span", "TOOLS COMPLETED"),
  );
  const legend = el("div", "", "flow-legend");
  for (const [cls, label] of [
    ["execution", "Execution"],
    ["data", "Mapped data"],
    ["live", "Live signal"],
  ])
    legend.append(el("span", label, cls));
  viewBar.append(
    counts,
    legend,
    button(
      "−",
      () => {
        state.fit = false;
        state.zoom = Math.max(0.7, state.zoom - 0.15);
        render();
      },
      "quiet-button",
    ),
    button(
      Math.round(state.zoom * 100) + "%",
      () => {
        state.fit = false;
        state.zoom = 1;
        render();
      },
      "quiet-button",
    ),
    button(
      "+",
      () => {
        state.fit = false;
        state.zoom = Math.min(1.6, state.zoom + 0.15);
        render();
      },
      "quiet-button",
    ),
  );
  viewBar.append(
    button(
      "Fit",
      () => {
        state.fit = true;
        state.forceFit = true;
        render();
      },
      "quiet-button",
    ),
  );
  work.append(viewBar);
  const canvas = el("div", "", "work-canvas");
  canvas.style.setProperty("--flow-zoom", state.zoom);
  canvas.append(
    companyScene(
      selected,
      (step) => {
        state.selectedStep = step;
        render();
      },
      {
        connections: [
          ...(data?.connections || []),
          ...(state.example?.slots || []).map((slot) => ({
            id: slot.key,
            kind: slot.kind,
            name: slot.name + " · setup required",
            execution: "unverified",
          })),
        ],
        selectedId: state.selectedStep?.id,
      },
    ),
  );
  work.append(canvas);
  const tools = el("nav", "", "workflow-tool-shelf");
  tools.setAttribute("aria-label", "Connected workflow tools");
  const shelfTitle = el("span", "YOUR TOOLS", "eyebrow");
  tools.append(shelfTitle);
  for (const c of data?.connections || []) {
    const b = button(c.name, () => connectionForm(c), "tool-shelf-item");
    b.prepend(el("span", c.kind.toUpperCase(), "tool-shelf-kind"));
    tools.append(b);
  }
  if (state.owner)
    tools.append(
      button("＋ Connect tool", () => connectionList(), "tool-shelf-add"),
    );
  work.append(tools);
  const strip = el("div", "", "work-insight");
  if (state.selectedStep) {
    strip.append(
      el("span", "STEP DETAIL · " + state.selectedStep.state, "eyebrow"),
      el("h3", state.selectedStep.title),
      el(
        "p",
        state.selectedStep.skill +
          " applies its skill; the Director calls " +
          state.selectedStep.tool +
          ".",
      ),
      el("details"),
    );
    strip.lastChild.append(
      el("summary", "Arguments & evidence"),
      el(
        "pre",
        JSON.stringify(
          {
            arguments:
              state.selectedStep.inputPreview || state.selectedStep.args,
            result: state.selectedStep.result,
          },
          null,
          2,
        ),
      ),
    );
  } else {
    strip.append(el("span", "LIVE JOURNAL", "eyebrow"));
    if (state.example)
      strip.append(
        el(
          "p",
          state.example.description ||
            "Inactive workflow example. Configure connections and inputs before requesting a run.",
        ),
      );
    if (selected && !state.example)
      strip.append(
        el(
          "p",
          (selected.calls || 0) +
            " model calls · " +
            (selected.automation ? "scheduled server run" : "on-demand work"),
        ),
      );
    for (const event of selected?.events?.slice(-3) || [])
      strip.append(el("p", event.text));
    if (!selected)
      strip.append(
        el(
          "p",
          "No simulated activity. Only confirmed tool results appear as completed work.",
        ),
      );
  }
  if (selected?.result?.files?.length) {
    const files = el("div", "", "delivered-files");
    for (const file of selected.result.files) {
      const a = el("a", "↓ " + file.name);
      a.href = safeWorkLink(file.url, location.origin) || "#";
      a.download = file.name;
      files.append(a);
    }
    strip.append(files);
  }
  for (const receipt of selected?.result?.receipts || [])
    strip.append(receiptElement(receipt));
  work.append(strip);
  main.append(conversation, work);
  shell.append(main);
  const footer = el("footer", "", "desk-footer");
  footer.append(
    el("span", "TH — A COMPANY THAT GETS TO WORK."),
    el("span", "Two AI roles. Skills, tools and evidence."),
  );
  shell.append(footer);
  root.append(shell);
  const currentCanvas = document.querySelector(".work-canvas");
  if (
    state.fit &&
    (!selected || selected.steps.length <= 4 || state.forceFit)
  ) {
    const scene = currentCanvas.querySelector("svg");
    const h = scene.viewBox.baseVal.height;
    scene.style.width =
      Math.min(
        currentCanvas.clientWidth - 24,
        Math.max(420, ((currentCanvas.clientHeight - 20) * 1000) / h),
      ) + "px";
    scene.style.minWidth = "0";
    scene.style.margin = "0 auto";
  }
  currentCanvas.scrollTop = canvasScroll;
  const next = document.querySelector(".conversation-log");
  next.scrollTop = bottom ? next.scrollHeight : scroll;
  if (focused) {
    const input = document.querySelector("#assistant-input");
    input.focus({ preventScroll: true });
    input.setSelectionRange(...selection);
  }
}
async function respond(action, extra = {}) {
  const job = current();
  if (!job) return;
  await sendJSON("company/jobs/" + job.id + "/respond", {
    revision: job.revision,
    action,
    hash: job.approval?.hash,
    ...extra,
  });
  await refresh();
}
async function refresh() {
  while (polling) await new Promise((resolve) => refreshWaiters.push(resolve));
  if (!state.owner) return;
  polling = true;
  try {
    const next = await api("company/workspace");
    if (state.selected && !next.jobs.some((j) => j.id === state.selected)) {
      try {
        next.jobs.unshift(
          (await api("company/jobs/" + encodeURIComponent(state.selected))).job,
        );
      } catch {
        state.selected = null;
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(state.data)) {
      state.data = next;
      if (state.selectedStep)
        state.selectedStep =
          (state.example?.procedure || current()?.steps || []).find(
            (s) => s.id === state.selectedStep.id,
          ) || null;
      render();
    }
  } catch (e) {
    notice(e.message);
  } finally {
    polling = false;
    for (const resume of refreshWaiters.splice(0)) resume();
  }
}
function account() {
  modal("Your workspace", (host) => {
    host.append(
      el(
        "p",
        "Signed in with your private owner workspace. Existing data stays on the server.",
      ),
      button(
        "Sign out",
        async () => {
          await sendJSON("auth/logout", {});
          location.reload();
        },
        "quiet-button",
      ),
    );
  });
}
function setup() {
  const settings = state.data?.settings || {
    ...defaultCompanySettings(),
    revision: 0,
  };
  modal("Two minds. One company.", (host) => {
    host.append(
      el(
        "p",
        "The Assistant handles your conversation. The Director plans and operates workflows. Skill positions do not have their own AI models.",
      ),
    );
    const name = field(host, "Company name", settings.name),
      slots = {};
    for (const slot of ["assistant", "director"]) {
      const area = el("section", "", "setup-slot");
      area.append(
        el(
          "h3",
          slot === "assistant"
            ? "01 / Personal assistant"
            : "02 / Workflow Director",
        ),
      );
      const provider = field(
          area,
          slot + " provider",
          settings[slot].provider,
          {
            options: [
              ["gemini", "Google Gemini"],
              ["openai", "OpenAI"],
              ["anthropic", "Anthropic"],
            ],
          },
        ),
        model = field(area, slot + " model", settings[slot].model),
        key = field(area, slot + " API key", "", { secret: true });
      key.placeholder = state.data?.providers?.[slot]
        ? "Saved · leave blank to keep it"
        : "Enter privately";
      slots[slot] = { provider, model, key };
      host.append(area);
      attachModelPicker({
        area,
        slot,
        provider,
        model,
        key,
        api,
        sendJSON,
        el,
        field,
        button,
        hasSavedKey: !!state.data?.providers?.[slot],
      });
    }
    const paid = field(
      host,
      "Allow provider charges within the bounded workflow budget",
      "",
      { type: "checkbox" },
    );
    paid.checked = settings.policy.allowPaid;
    const calls = field(
      host,
      "Maximum model calls per request",
      settings.policy.maxCalls,
      { type: "number" },
    );
    const skillArea = el("details", "", "skill-profiles");
    skillArea.append(
      el(
        "summary",
        settings.skills.length + " skill positions · no extra AI models",
      ),
    );
    const skills = settings.skills.map((skill) => {
      const section = el("section");
      const name = field(section, "Position name · " + skill.id, skill.name),
        description = field(
          section,
          "Skill instructions · " + skill.id,
          skill.description,
          { rows: 3 },
        );
      skillArea.append(section);
      return { id: skill.id, name, description };
    });
    host.append(skillArea);
    const status = el("p", "", "setup-status");
    host.append(
      status,
      button(
        "Save company setup",
        async () => {
          const value = {
            ...settings,
            name: name.value,
            policy: { allowPaid: paid.checked, maxCalls: Number(calls.value) },
            skills: skills.map((s) => ({
              id: s.id,
              name: s.name.value,
              description: s.description.value,
            })),
          };
          for (const slot of ["assistant", "director"]) {
            value[slot] = {
              provider: slots[slot].provider.value,
              model: slots[slot].model.value,
            };
            if (slots[slot].key.value) {
              await sendJSON(
                "company/model-key/" + slot,
                { provider: value[slot].provider, key: slots[slot].key.value },
                "PUT",
              );
              slots[slot].key.value = "";
            }
          }
          await sendJSON("company/settings", value, "PUT");
          status.textContent = "Saved. Your pending request can now continue.";
          await refresh();
        },
        "ink-button",
      ),
    );
  });
}
const exampleStudio = createExampleStudio({
  api,
  sendJSON,
  modal,
  field,
  el,
  button,
  refresh,
  getData: () => state.data,
  onPreview: (example) => {
    state.example = example;
    state.selectedStep = null;
    state.fit = true;
    render();
  },
  onUse: (recipe) => {
    state.example = null;
    state.requestRecipeId = recipe.id;
    state.reply = false;
    state.draft =
      'Use my configured workflow "' +
      recipe.title +
      '". ' +
      recipe.instructions;
    render();
    document.querySelector("#assistant-input").focus();
  },
});
const connectionStudio = createConnectionStudio({
  api,
  sendJSON,
  modal,
  field,
  el,
  button,
  refresh,
  notice,
  getData: () => state.data,
});
function connectionList() {
  return connectionStudio.list();
}
function connectionForm(existing = null, need = {}) {
  return connectionStudio.form(existing, need);
}
function automation(recipe) {
  modal("Independent automation", (host) => {
    host.append(
      el(
        "p",
        recipe.title + " · procedure version " + (recipe.procedureVersion || 1),
      ),
      el(
        "p",
        "This workflow runs on the server. Closing a tab does not stop it. Scheduled runs of the same workflow do not overlap; two different jobs can make progress concurrently.",
      ),
    );
    const enabled = field(host, "Run independently on the server", "", {
      type: "checkbox",
    });
    enabled.checked = !!recipe.automation?.enabled;
    const interval = field(
        host,
        "Run every (minutes)",
        recipe.automation?.intervalMinutes || 30,
        { type: "number" },
      ),
      runs = field(
        host,
        "Maximum runs per day",
        recipe.automation?.maxRunsPerDay || 12,
        { type: "number" },
      ),
      calls = field(
        host,
        "Maximum Director calls per run",
        recipe.automation?.maxCalls || 4,
        { type: "number" },
      ),
      writes = field(
        host,
        "Approve writes/publications for this listed workflow scope",
        "",
        { type: "checkbox" },
      ),
      media = field(
        host,
        "Approve visual generation charges for this workflow",
        "",
        { type: "checkbox" },
      );
    writes.checked = !!recipe.automation?.allowWrites;
    media.checked = !!recipe.automation?.allowMedia;
    const scope = el("ul", "", "automation-scope");
    for (const step of (recipe.procedure || []).filter(
      (s) =>
        !(
          recipe.procedure.some((v) => v.verifiedServerRun) &&
          ["inspect_python", "stage_python"].includes(s.tool)
        ),
    ))
      scope.append(
        el(
          "li",
          step.title +
            " · " +
            step.tool +
            (step.connection ? " / " + step.connection : ""),
        ),
      );
    host.append(scope);
    if (recipe.automation?.pauseReason)
      host.append(el("p", recipe.automation.pauseReason));
    const status = el("p", "", "setup-status");
    host.append(
      status,
      button(
        "Save automation",
        async () => {
          await sendJSON(
            "company/recipes/" + recipe.id + "/automation",
            {
              revision: recipe.revision,
              enabled: enabled.checked,
              intervalMinutes: Number(interval.value),
              maxRunsPerDay: Number(runs.value),
              maxCalls: Number(calls.value),
              allowWrites: writes.checked,
              allowMedia: media.checked,
            },
            "PUT",
          );
          status.textContent = enabled.checked
            ? "Automation is enabled. You can leave this tab."
            : "Automation is off. Already active tool calls finish safely.";
          await refresh();
        },
        "ink-button",
      ),
    );
  });
}
async function start() {
  render();
  try {
    const session = await api("auth/session");
    state.owner = !!session.authenticated;
    if (state.owner) await refresh();
    else render();
  } catch (e) {
    notice("The workspace is not reachable yet. " + e.message);
  }
  const poll = async () => {
    clearTimeout(pollTimer);
    if (!document.hidden) await refresh();
    pollTimer = setTimeout(
      poll,
      state.data?.jobs.some((j) => ["running", "queued"].includes(j.state))
        ? 2500
        : 15000,
    );
  };
  pollTimer = setTimeout(poll, 2500);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
}
window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#work/")) {
    state.example = null;
    state.requestRecipeId = null;
    state.selected = location.hash.slice(6);
    state.reply = null;
    render();
  }
});
start();
