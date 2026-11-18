import { workflowExamples } from "./workflow-examples.js";
import { connectionTypes } from "./company-connections.js";
export function createExampleStudio({
  api,
  sendJSON,
  modal,
  field,
  el,
  button,
  refresh,
  getData,
  onPreview,
  onUse,
}) {
  function open(title, build) {
    document.querySelector("#modal").close();
    modal(title, build);
    document.querySelector("#modal").classList.add("connection-dialog");
  }
  const help = (host, text) => host.append(el("p", text, "connector-help"));
  function library() {
    open("Workflow examples", (host) => {
      help(
        host,
        "37 configurable workflows covering the available tools, connections and combined operations. Preview does not run tools, call models, publish or enable automation.",
      );
      const drafts = (getData()?.recipes || []).filter(
        (r) => r.source === "personal-example",
      );
      if (drafts.length) {
        host.append(el("h3", "Your editable drafts", "connector-group-title"));
        const grid = el("div", "", "example-grid");
        for (const r of drafts) grid.append(card(r, true));
        host.append(grid);
      }
      const categories = [...new Set(workflowExamples.map((e) => e.category))];
      for (const category of categories) {
        host.append(el("h3", category, "connector-group-title"));
        const grid = el("div", "", "example-grid");
        for (const example of workflowExamples.filter(
          (e) => e.category === category,
        ))
          grid.append(card(example));
        host.append(grid);
      }
    });
  }
  function card(example, owned = false) {
    const c = el("article", "", "example-card");
    c.append(
      el(
        "span",
        (example.procedure?.length || 0) +
          " BLOCKS · " +
          (owned ? "YOUR DRAFT" : "SETUP REQUIRED"),
        "eyebrow",
      ),
      el("h4", example.title),
      el("p", example.description || example.instructions),
    );
    const actions = el("div", "", "connection-toolbar");
    actions.append(
      button(
        "Preview workflow",
        () => {
          document.querySelector("#modal").close();
          onPreview(example);
        },
        "quiet-button",
      ),
      button(
        owned ? "Edit draft" : "Configure a copy",
        async () => {
          let id = example.id;
          if (!owned)
            id = (
              await sendJSON("company/examples/" + example.id + "/copy", {})
            ).id;
          await refresh();
          edit(getData().recipes.find((r) => r.id === id));
        },
        "ink-button",
      ),
    );
    c.append(actions);
    return c;
  }
  function edit(recipe) {
    open("Configure workflow draft", (host) => {
      help(
        host,
        "This draft is inactive. Bind connections, replace YOUR_ placeholders and save it. Credentials belong in Connections. Sending a request starts planning through your assistant, including any missing-input questions or approvals.",
      );
      const title = field(host, "Workflow title", recipe.title),
        instructions = field(
          host,
          "Workflow instructions",
          recipe.instructions,
          { rows: 4 },
        );
      const bindingControls = {};
      const grid = el("div", "", "connector-field-grid");
      host.append(grid);
      for (const slot of recipe.slots || []) {
        const matches = (getData()?.connections || []).filter(
          (c) =>
            c.kind === slot.kind &&
            (!slot.action ||
              slot.action.startsWith("YOUR_") ||
              c.action === slot.action),
        );
        bindingControls[slot.key] = field(
          grid,
          slot.name + " · " + (connectionTypes[slot.kind]?.title || slot.kind),
          recipe.bindings?.[slot.key] || "",
          {
            options: [
              ["", "Not connected — configure later"],
              ...matches.map((c) => [c.id, c.name]),
            ],
          },
        );
      }
      help(
        host,
        (recipe.needs || []).length
          ? "Before running: " + recipe.needs.join(" · ")
          : "No external connection is required for this example. Replace sample input before running it.",
      );
      const advanced = el("details", "", "connector-advanced");
      advanced.append(
        el(
          "summary",
          "Step inputs, dependencies, conditions and operations (JSON)",
        ),
      );
      const definition = field(
        advanced,
        "Workflow blocks",
        JSON.stringify(recipe.procedure, null, 2),
        { rows: 18 },
      );
      host.append(advanced);
      const status = el("p", "", "setup-status");
      host.append(status);
      const actions = el("div", "", "connection-toolbar");
      host.append(actions);
      async function save() {
        const bindings = Object.fromEntries(
          Object.entries(bindingControls).map(([k, v]) => [k, v.value]),
        );
        const procedure = JSON.parse(definition.value).map((s) => {
          const slot =
            s.connectionSlot ||
            (recipe.slots || []).find(
              (slot) =>
                s.connection === slot.key ||
                recipe.bindings?.[slot.key] === s.connection,
            )?.key;
          return {
            ...s,
            ...(slot
              ? { connectionSlot: slot, connection: bindings[slot] || slot }
              : {}),
          };
        });
        await sendJSON(
          "company/examples/" + recipe.id,
          {
            revision: recipe.revision,
            title: title.value,
            instructions: instructions.value,
            bindings,
            procedure,
          },
          "PUT",
        );
        await refresh();
        recipe = getData().recipes.find((r) => r.id === recipe.id);
        status.textContent =
          "Draft saved. No tools were run and automation remains off.";
        return recipe;
      }
      actions.append(
        button("Save draft", () => save(), "ink-button"),
        button(
          "Preview saved draft",
          async () => {
            const r = await save();
            document.querySelector("#modal").close();
            onPreview(r);
          },
          "quiet-button",
        ),
        button(
          "Prepare request for assistant",
          async () => {
            const r = await save();
            document.querySelector("#modal").close();
            onUse(r);
          },
          "quiet-button",
        ),
        button("Back to examples", () => library(), "text-button"),
      );
    });
  }
  return { library, edit };
}
