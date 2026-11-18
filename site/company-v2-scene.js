import { flowLayout, dependencies, references } from "./company-flow.js";
import { toolCatalog } from "./company-v2-model.js";
import { connectionTypes } from "./company-connections.js";
const n = (tag, attrs = {}, text) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};
const colors = {
  skipped: "#8a8b83",
  waiting_timer: "#ad893a",
  pending: "#6b8187",
  executing: "#147f91",
  completed: "#347557",
  waiting_external: "#147f91",
  waiting_approval: "#b07b24",
  blocked: "#b84b49",
  uncertain: "#b84b49",
  cancelled: "#7d8990",
};
const iconPaths = {
  condition: "M0-16L17 0L0 16L-17 0Z M0-7v9 M0 8h.1",
  join: "M-13-12V-4L0 4L13-4V-12 M0 4v12",
  delay: "M0-15a15 15 0 1 0 .1 0 M0-9v10l7 4",
  query:
    "M-12-8C-12-15 12-15 12-8S-12-1-12-8v17c0 8 24 8 24 0V-8M-12 0c0 8 24 8 24 0",
  export: "M-10-15H5l8 8v23h-23Z M4-15v9h9 M-5 1h13 M-5 7h13",
  report: "M-10-15H5l8 8v23h-23Z M-5-2h8 M-5 4h13 M-5 10h10",
  publish: "M-12-3l20-9v24l-20-9Z M-8 3v10h6V5",
  message: "M-14-12h28v20H-3l-8 7V8h-3Z M-8-5H8 M-8 1H4",
  bridge: "M-16-12h32V9h-32Z M-7 15H7 M0 9v6",
  service: "M-12 0H12 M0-12V12 M-12-12h7v7h-7Z M5 5h7v7H5Z",
  source:
    "M-6 5l-3 3c-7 7-15-3-8-9l8-8c6-6 15 2 8 8 M6-5l3-3c7-7 15 3 8 9l-8 8c-6 6-15-2-8-8",
  media: "M-15-12h30v25h-30Z M-11 8l8-10 6 6 5-4 5 8 M7-5h1",
  asset: "M-15-12h30v25h-30Z M-11 8l8-10 6 6 5-4 5 8",
  browse: "M-16-9h12l4 5h16v17h-32Z",
  inspect_python: "M-12-12h18v23h-18Z M5 2a7 7 0 1 0 1 0 M10 9l7 7",
  stage_python: "M-13 3v11h26V3 M0 6v-20 M-6-8l6-6 6 6",
};
function textLines(text, max = 49) {
  const words = String(text || "").split(/\s+/),
    lines = [""];
  for (const word of words) {
    if ((lines.at(-1) + " " + word).trim().length > max && lines.length < 2)
      lines.push(word);
    else lines[lines.length - 1] += (lines.at(-1) ? " " : "") + word;
  }
  return lines.map((s) => (s.length > max ? s.slice(0, max - 1) + "…" : s));
}
export function stepDependencies(step) {
  const refs = new Map();
  function visit(value, key = "") {
    if (!value || typeof value !== "object") {
      if (
        ["from", "mediaFrom", "toolFrom"].includes(key) &&
        /^step-\d+$/.test(value || "")
      )
        refs.set(value, key);
      return;
    }
    if (value.$step) refs.set(value.$step, value.path || "output");
    for (const [k, v] of Object.entries(value)) visit(v, k);
  }
  visit(step.args);
  return [...refs].map(([id, path]) => ({ id, path }));
}
export function companyScene(
  job,
  onSelect,
  { connections = [], selectedId = null, newStepIds = new Set() } = {},
) {
  const steps = job?.steps || [],
    layout = flowLayout(steps),
    height = layout.height,
    svg = n("svg", {
      viewBox: `0 0 1000 ${height}`,
      class: "company-flow",
      role: "group",
      "aria-label":
        "Live workflow. Separate tools, real execution order and mapped data signals.",
    });
  const defs = n("defs"),
    marker = n("marker", {
      id: "signal-arrow",
      viewBox: "0 0 10 10",
      refX: 8,
      refY: 5,
      markerWidth: 7,
      markerHeight: 7,
      orient: "auto-start-reverse",
    });
  marker.append(n("path", { d: "M0 0L10 5L0 10Z", fill: "context-stroke" }));
  defs.append(marker);
  svg.append(defs);
  const hub = (x, title, active) => {
    const g = n("g", {
      class: "mind-hub" + (active ? " active" : ""),
      "aria-label": title + " · AI role",
    });
    g.append(
      n("rect", {
        x: x - 78,
        y: 23,
        width: 156,
        height: 38,
        rx: 6,
        fill: "#f7faf8",
        stroke: active ? "#6cae9f" : "#c4d8d0",
      }),
      n("circle", {
        cx: x - 58,
        cy: 42,
        r: 3,
        fill: active ? "#16839a" : "#8fab9c",
        class: "hub-status",
      }),
      n("text", { x: x - 44, y: 47, class: "hub-name" }, title),
    );
    svg.append(g);
  };
  hub(335, "Assistant", job?.state === "running" && job.phase === "assistant");
  hub(665, "Director", job?.state === "running" && job.phase !== "assistant");
  svg.append(
    n("path", {
      d: "M417 42H582",
      class: "control-route" + (job?.state === "running" ? " active" : ""),
      "marker-end": "url(#signal-arrow)",
    }),
  );
  if (!steps.length) {
    svg.append(
      n(
        "text",
        { x: 500, y: 153, "text-anchor": "middle", class: "flow-empty" },
        job?.state === "waiting_input"
          ? "Waiting for your input"
          : job?.phase === "assistant"
            ? "Understanding request…"
            : "Preparing workflow…",
      ),
    );
    return svg;
  }
  const { positions, groups } = layout;
  groups.forEach((group, level) => {
    if (group.length === 1 && !group[0].operation) return;
    const y = positions.get(group[0].id).y;
    svg.append(
      n(
        "text",
        { x: 55, y: y - 20, class: "layer-label" },
        "Layer " +
          String(level + 1).padStart(2, "0") +
          " · " +
          (group.length > 1
            ? group.length + " branches"
            : group[0].operation || ""),
      ),
    );
  });
  for (const s of steps) {
    const target = positions.get(s.id),
      center = target.x + target.w / 2,
      parents = dependencies(s, steps);
    for (const parent of parents.length ? parents : ["director"]) {
      const source = positions.get(parent),
        fromX = source ? source.x + source.w / 2 : 665,
        fromY = source ? source.y + 146 : 66;
      const active = ["executing", "waiting_external"].includes(s.state),
        previous = steps.find((p) => p.id === parent);
      const path = n("path", {
        d: `M${fromX} ${fromY}C${fromX} ${fromY + 24} ${center} ${target.y - 37} ${center} ${target.y - 8}`,
        class:
          "step-route" +
          (active
            ? " active"
            : previous?.state === "completed"
              ? " confirmed"
              : ""),
        "data-from": parent,
        "data-to": s.id,
        "marker-end": "url(#signal-arrow)",
      });
      path.append(
        n(
          "title",
          {},
          parent + " → " + s.id + (s.when ? " · conditional branch" : ""),
        ),
      );
      svg.append(path);
    }
    for (const ref of references(s.args)) {
      const source = positions.get(ref);
      if (!source) continue;
      const rail = source.x === target.x ? target.x - 26 : 490;
      const edge = n("path", {
        d: `M${source.x + source.w - 15} ${source.y + 133}H${rail}V${target.y + 84}H${target.x - 5}`,
        class: "data-route" + (s.state === "executing" ? " active" : ""),
        "data-source": ref,
        "data-target": s.id,
        "marker-end": "url(#signal-arrow)",
      });
      edge.append(n("title", {}, "Mapped data " + ref + " → " + s.id));
      svg.append(edge);
    }
    if (s.when)
      svg.append(
        n(
          "text",
          {
            x: target.x + target.w - 8,
            y: target.y - 10,
            "text-anchor": "end",
            class: "signal-label",
          },
          "IF " +
            s.when.step +
            "." +
            (s.when.path || "value") +
            " " +
            s.when.op +
            " " +
            String(s.when.value),
        ),
      );
  }
  for (const [i, s] of steps.entries()) {
    const { x, y, w } = positions.get(s.id),
      h = 140,
      c = connections.find((c) => c.id === s.connection),
      kind = connectionTypes[c?.kind],
      color = colors[s.state] || colors.pending;
    const g = n("g", {
      class:
        "flow-step " +
        s.state +
        (s.id === selectedId ? " selected" : "") +
        (newStepIds.has(s.id) ? " is-new" : ""),
      "data-step-id": s.id,
      "data-tool": s.tool,
      role: "button",
      tabindex: 0,
      "aria-label": s.title + " · " + s.state,
      "aria-pressed": s.id === selectedId ? "true" : "false",
    });
    g.append(
      n(
        "title",
        {},
        s.title +
          "\nTool: " +
          s.tool +
          "\nConnection: " +
          (c?.name || s.connection || "Workspace") +
          "\nPrepared input: " +
          JSON.stringify(s.inputPreview || s.args || {}).slice(0, 500),
      ),
      n("rect", {
        x: x + 7,
        y: y + 8,
        width: w,
        height: h,
        rx: 14,
        class: "tool-depth",
      }),
      n("rect", { x, y, width: w, height: h, rx: 14, class: "tool-face" }),
      n("path", {
        d: `M${x + 15} ${y + 1}h${w - 30}`,
        stroke: color,
        "stroke-width": 3,
      }),
      n("circle", { cx: x + w / 2, cy: y, r: 5, class: "signal-port" }),
      n("circle", { cx: x + w / 2, cy: y + h, r: 5, class: "signal-port" }),
      n("rect", {
        x: x + 18,
        y: y + 20,
        width: 46,
        height: 46,
        rx: 11,
        fill: color + "15",
      }),
    );
    const icon = n("g", {
      transform: `translate(${x + 41} ${y + 43})`,
      class: "tool-glyph",
      stroke: color,
    });
    icon.append(n("path", { d: iconPaths[s.tool] || iconPaths.service }));
    g.append(
      icon,
      n(
        "text",
        { x: x + 79, y: y + 31, class: "tool-category" },
        String(i + 1).padStart(2, "0") +
          " / " +
          (toolCatalog[s.tool]?.title || s.tool).toUpperCase(),
      ),
    );
    for (const [j, line] of textLines(s.title, w < 500 ? 32 : 49).entries())
      g.append(
        n("text", { x: x + 79, y: y + 56 + j * 18, class: "tool-title" }, line),
      );
    g.append(
      n("line", {
        x1: x + 18,
        y1: y + 91,
        x2: x + w - 18,
        y2: y + 91,
        class: "tool-rule",
      }),
      n(
        "text",
        { x: x + 20, y: y + 115, class: "tool-connection" },
        (kind?.icon || "TH") +
          "  " +
          String(c?.name || s.connection || "Workspace output").slice(
            0,
            w < 500 ? 24 : 37,
          ),
      ),
      n(
        "text",
        { x: x + 20, y: y + 132, class: "tool-location" },
        c?.kind === "bridge" || c?.transport === "device"
          ? c.execution === "server"
            ? "SERVER TOOL"
            : c.execution === "desktop"
              ? "LAPTOP · ONLINE REQUIRED"
              : "LOCATION NOT VERIFIED"
          : "SERVER / " + (s.skill || "DIRECTOR").toUpperCase(),
      ),
      n("circle", { cx: x + w - 143, cy: y + 113, r: 4, fill: color }),
      n(
        "text",
        { x: x + w - 131, y: y + 117, class: "tool-status", fill: color },
        s.state.replaceAll("_", " ").toUpperCase(),
      ),
    );
    g.onclick = () => onSelect(s);
    g.onkeydown = (e) => {
      if (["Enter", " "].includes(e.key)) {
        e.preventDefault();
        onSelect(s);
      }
    };
    svg.append(g);
  }
  return svg;
}
