const ns = "http://www.w3.org/2000/svg",
  n = (tag, a = {}, text) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(a)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    return el;
  };
export function companyScene(job, onSelect) {
  const steps = job?.steps || [],
    height = Math.max(490, 180 + steps.length * 108),
    svg = n("svg", {
      viewBox: `0 0 900 ${height}`,
      class: "company-flow",
      role: "group",
      "aria-label":
        "Live workflow. Assistant and Director are the only AI roles. Select a step to inspect actual work.",
    });
  const defs = n("defs"),
    filter = n("filter", {
      id: "paper-shadow",
      x: "-30%",
      y: "-30%",
      width: "180%",
      height: "200%",
    });
  filter.append(
    n("feDropShadow", {
      dx: 0,
      dy: 13,
      stdDeviation: 12,
      "flood-color": "#244541",
      "flood-opacity": ".12",
    }),
  );
  defs.append(filter);
  svg.append(defs);
  const route = n("path", {
    d: `M450 120 C650 160 245 190 450 250 S650 365 450 420 S250 510 450 ${height - 45}`,
    fill: "none",
    stroke: "#d7e3dc",
    "stroke-width": 2,
    "stroke-dasharray": "5 8",
  });
  svg.append(route);
  const hub = (x, title, subtitle, color, shape) => {
    const g = n("g", {
      "aria-label": title + " · AI role",
      class:
        "mind-hub" +
        (job?.state === "running" &&
        ((title === "Assistant" && job.phase === "assistant") ||
          (title === "Director" && job.phase !== "assistant"))
          ? " active"
          : ""),
    });
    g.append(
      n("ellipse", {
        cx: x,
        cy: 100,
        rx: 87,
        ry: 13,
        fill: "#193c38",
        opacity: ".07",
      }),
      n("path", { d: `M${x - 75} 60l75 -28 75 28 -75 32Z`, fill: color }),
      n("path", { d: `M${x - 75} 60v18l75 32V92Z`, fill: "#c3d2c8" }),
      n("path", { d: `M${x + 75} 60v18l-75 32V92Z`, fill: "#91afa2" }),
      n(
        "text",
        { x, y: 64, "text-anchor": "middle", class: "mind-title" },
        shape,
      ),
      n(
        "text",
        { x, y: 138, "text-anchor": "middle", class: "flow-name" },
        title,
      ),
      n(
        "text",
        { x, y: 159, "text-anchor": "middle", class: "flow-sub" },
        subtitle,
      ),
    );
    svg.append(g);
  };
  hub(320, "Assistant", "Your one point of contact", "#d9edcf", "01");
  hub(580, "Director", "Plans, coordinates, executes", "#c4dad4", "02");
  svg.append(
    n("path", { d: "M400 65h100", stroke: "#70978c", "stroke-width": 2 }),
    n("circle", { cx: 450, cy: 65, r: 5, fill: "#527d70" }),
  );
  if (!steps.length) {
    svg.append(
      n(
        "text",
        { x: 450, y: 285, "text-anchor": "middle", class: "flow-empty" },
        job?.phase === "conversation"
          ? "A conversation, without extra work."
          : job
            ? "Your request is becoming a workflow."
            : "A clear request. A real result.",
      ),
      n(
        "text",
        { x: 450, y: 315, "text-anchor": "middle", class: "flow-sub" },
        job?.phase === "conversation"
          ? "No tools were called."
          : job?.state === "waiting_input"
            ? "Your assistant is waiting for the missing detail."
            : "The right tools appear here when there is work to do.",
      ),
    );
    for (let i = 0; i < 3; i++) {
      const x = 260 + i * 150;
      svg.append(
        n("path", {
          d: `M${x} 375l90 -20 25 38 -90 20Z`,
          fill: i % 2 ? "#e3eae8" : "#e8eee1",
          stroke: "#d6e1da",
        }),
      );
    }
    return svg;
  }
  for (const [i, s] of steps.entries()) {
    const targetX = (i % 2 ? 400 : 130) + 165,
      targetY = 220 + i * 108,
      previousX = i === 0 ? 580 : ((i - 1) % 2 ? 400 : 130) + 165,
      previousY = i === 0 ? 175 : 220 + (i - 1) * 108 + 70;
    svg.append(
      n("path", {
        d: `M${previousX} ${previousY}C${previousX} ${previousY + 30} ${targetX} ${targetY - 40} ${targetX} ${targetY - 10}`,
        class: "step-route" + (s.state === "executing" ? " active" : ""),
      }),
    );
    const x = i % 2 ? 400 : 130,
      y = 220 + i * 108,
      w = 330,
      g = n("g", {
        class: "flow-step " + s.state,
        "data-step-id": s.id,
        role: "button",
        tabindex: 0,
        "aria-label": s.title + " · " + s.state,
      });
    g.append(
      n(
        "title",
        {},
        s.title +
          " · " +
          s.state +
          "\nPrepared runtime input: " +
          JSON.stringify(s.inputPreview || s.args || {}).slice(0, 450),
      ),
    );
    g.append(
      n("path", {
        d: `M${x} ${y}l${w - 20} -24 38 62 -${w - 20} 24Z`,
        fill:
          s.state === "completed"
            ? "#e0edda"
            : s.state === "executing"
              ? "#c5e2da"
              : "#fbfcf8",
        stroke: s.state === "executing" ? "#4b8c78" : "#d6e1d9",
        filter: "url(#paper-shadow)",
      }),
      n("path", { d: `M${x} ${y}v13l38 62v-13Z`, fill: "#c2d4c6" }),
      n("path", {
        d: `M${x + 38} ${y + 62}v13l${w - 20} -24v-13Z`,
        fill: "#a7c1b1",
      }),
      n("circle", {
        cx: x + 35,
        cy: y + 16,
        r: 15,
        fill: s.state === "completed" ? "#557f62" : "#e3ebe3",
      }),
      n(
        "text",
        { x: x + 35, y: y + 20, "text-anchor": "middle", class: "step-number" },
        s.state === "completed" ? "✓" : String(i + 1).padStart(2, "0"),
      ),
      n(
        "text",
        { x: x + 63, y: y + 12, class: "flow-name" },
        s.title.length > 32 ? s.title.slice(0, 31) + "…" : s.title,
      ),
      n(
        "text",
        { x: x + 63, y: y + 33, class: "flow-sub" },
        s.skill + " / " + s.tool,
      ),
      n(
        "text",
        { x: x + w + 25, y: y + 20, class: "flow-state" },
        s.state.replaceAll("_", " "),
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
