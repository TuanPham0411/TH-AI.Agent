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
  let activeLibraryTab = null,
    searchText = "",
    category = "all";
  function library() {
    open("Workflows", (host) => {
      const saved = (getData()?.recipes || []).filter(
        (r) => r.source !== "starter-template",
      );
      activeLibraryTab ||= saved.length ? "saved" : "examples";
      const bar = el("div", "", "library-toolbar"),
        tabs = el("div", "", "library-tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Workflow library");
      const content = el("div", "", "library-content"),
        count = el("span", "", "library-count");
      const search = field(bar, "Search workflows", searchText);
      search.type = "search";
      search.placeholder = "Search workflows…";
      const categories = [...new Set(workflowExamples.map((e) => e.category))];
      const filter = field(bar, "Category", category, {
        options: [["all", "All categories"], ...categories.map((c) => [c, c])],
      });
      filter.closest("label").classList.add("library-category");
      function draw() {
        tabs.replaceChildren();
        for (const [key, title] of [
          ["saved", "My workflows"],
          ["examples", "Examples"],
        ]) {
          const b = button(
            title,
            () => {
              activeLibraryTab = key;
              draw();
            },
            "",
          );
          b.setAttribute("role", "tab");
          b.setAttribute("aria-selected", activeLibraryTab === key);
          tabs.append(b);
        }
        const items = (
          activeLibraryTab === "saved" ? saved : workflowExamples
        ).filter(
          (r) =>
            (category === "all" || r.category === category) &&
            (r.title + " " + (r.description || r.instructions || ""))
              .toLowerCase()
              .includes(searchText.toLowerCase()),
        );
        count.textContent =
          items.length +
          " " +
          (activeLibraryTab === "saved" ? "saved" : "examples");
        content.replaceChildren();
        if (!items.length) {
          content.append(
            el(
              "p",
              activeLibraryTab === "saved"
                ? "No saved workflows. Choose an example or ask your assistant to create one."
                : "No matching workflows.",
              "connector-help",
            ),
          );
          return;
        }
        const grid = el("div", "", "example-grid");
        for (const r of items)
          grid.append(card(r, activeLibraryTab === "saved"));
        content.append(grid);
      }
      search.oninput = () => {
        searchText = search.value;
        draw();
      };
      filter.onchange = () => {
        category = filter.value;
        draw();
      };
      bar.prepend(tabs);
      bar.append(count);
      host.append(bar, content);
      draw();
    });
  }
  function card(example, owned = false) {
    const c = el("article", "", "example-card");
    c.append(
      el(
        "span",
        (example.procedure?.length || 0) +
          " BLOCKS · " +
          (owned
            ? example.draft
              ? "DRAFT"
              : example.source === "legacy-workflow"
                ? "LEGACY"
                : "VERIFIED"
            : "EXAMPLE"),
        "eyebrow",
      ),
      el("h4", example.title),
      el("p", example.description || example.instructions),
    );
    const actions = el("div", "", "connection-toolbar");
    if (example.procedure?.length)
      actions.append(
        button(
          "Preview workflow",
          () => {
            document.querySelector("#modal").close();
            onPreview(example);
          },
          "quiet-button",
        ),
      );
    if (owned && example.source !== "personal-example") {
      actions.append(
        button(
          "Prepare request",
          () => {
            document.querySelector("#modal").close();
            onUse(example);
          },
          "ink-button",
        ),
      );
    } else
      actions.append(
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
        "Bind connections and replace YOUR_ inputs. This draft stays inactive until you send a request. Store credentials in Connections.",
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
      const actions = el("div", "", "connection-toolbar dialog-actions");
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
