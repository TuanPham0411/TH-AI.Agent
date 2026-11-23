const NS = "http://www.w3.org/2000/svg";
const DURATION = 5300,
  DRAW = 1850,
  TYPE = 2100;
const BUILDERS = [
  {
    name: "Layout",
    color: "#168aa0",
    at: 0,
    lines: [
      [".desk-header", "rect"],
      [".desk-header nav button", "rect"],
    ],
    text: ".brand-name strong, .desk-header nav button",
    reveal: ".desk-header",
  },
  {
    name: "Assistant",
    color: "#7866ca",
    at: 160,
    lines: [
      [".assistant-desk", "right"],
      [".assistant-heading", "bottom"],
    ],
    text: ".assistant-heading h1, .assistant-heading button, .conversation-empty p",
    reveal: ".assistant-heading, .conversation-empty",
  },
  {
    name: "Workflow",
    color: "#16876c",
    at: 320,
    lines: [
      [".work-heading", "bottom"],
      [".work-canvas", "rect"],
      [".flow-step .tool-face", "rect"],
    ],
    text: ".work-heading h2, .workflow-empty h3, .workflow-empty p",
    reveal: ".work-heading, .workflow-empty, .flow-toolbar, .company-flow",
  },
  {
    name: "Controls",
    color: "#b57b28",
    at: 480,
    lines: [
      [".assistant-compose", "top"],
      [".assistant-compose textarea", "rect"],
      [".assistant-compose button", "rect"],
    ],
    text: ".assistant-compose button, .compose-context",
    reveal: ".assistant-compose",
    placeholder: ".assistant-compose textarea",
  },
];
const node = (tag, cls) => {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
};
function svg(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function arrow(color) {
  const e = svg("svg", { viewBox: "0 0 28 32" });
  e.append(
    svg("path", {
      d: "M3 2L24 20L14 21L10 30Z",
      fill: color,
      stroke: "white",
      "stroke-width": 2,
      "stroke-linejoin": "round",
    }),
  );
  return e;
}
const clamp = (n) => Math.min(1, Math.max(0, n));
function outline(element, edge) {
  const r = element.getBoundingClientRect(),
    x = r.left + 0.5,
    y = r.top + 0.5,
    w = Math.max(1, r.width - 1),
    h = Math.max(1, r.height - 1);
  if (r.width < 5 || r.height < 5 || r.bottom < 0 || r.top > innerHeight)
    return null;
  if (edge === "bottom") return `M${x} ${y + h}H${x + w}`;
  if (edge === "top") return `M${x} ${y}H${x + w}`;
  if (edge === "right") return `M${x + w} ${y}V${y + h}`;
  const radius = Math.min(
    parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
    w / 2,
    h / 2,
  );
  return `M${x + radius} ${y}H${x + w - radius}Q${x + w} ${y} ${x + w} ${y + radius}V${y + h - radius}Q${x + w} ${y + h} ${x + w - radius} ${y + h}H${x + radius}Q${x} ${y + h} ${x} ${y + h - radius}V${y + radius}Q${x} ${y} ${x + radius} ${y}`;
}
// A document-only visual construction. Text remains real, complete and accessible.
export function createWorkspaceEntrance() {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let start = null,
    finished = false,
    layer = null,
    sheet = null,
    raf = null,
    builders = [];
  let runs = [],
    hidden = new Map(),
    placeholders = [];
  const segmenter =
    typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
  function restore() {
    for (const { wrapper, original } of runs)
      if (wrapper.isConnected) wrapper.replaceWith(original);
    for (const [element, value] of hidden)
      if (element.isConnected) {
        if (value) element.style.opacity = value;
        else element.style.removeProperty("opacity");
      }
    for (const element of placeholders)
      element.classList.remove("workspace-placeholder-writing");
    runs = [];
    hidden = new Map();
    placeholders = [];
  }
  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    restore();
    layer?.remove();
    layer = null;
    sheet = null;
    builders = [];
    document.documentElement.removeAttribute("data-workspace-assembling");
    window.removeEventListener("pointerdown", finish, true);
    window.removeEventListener("keydown", finish, true);
    window.removeEventListener("wheel", finish, true);
    window.removeEventListener("resize", finish);
    document.removeEventListener("visibilitychange", visibility);
    motion.removeEventListener?.("change", finish);
  }
  function visibility() {
    if (document.hidden) finish();
  }
  function hide(element) {
    if (!hidden.has(element)) hidden.set(element, element.style.opacity);
    element.style.opacity = "0";
  }
  function letters(element, record) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT),
      texts = [];
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (
        text.textContent.trim() &&
        !text.parentElement.closest("svg,script,style")
      )
        texts.push(text);
    }
    for (const original of texts) {
      const wrapper = node("span", "workspace-write-run");
      const segments = segmenter
        ? [...segmenter.segment(original.textContent)].map((s) => s.segment)
        : Array.from(original.textContent);
      for (const text of segments) {
        const letter = node("span", "workspace-write-letter");
        letter.textContent = text;
        letter.style.opacity = "0";
        wrapper.append(letter);
        record.letters.push(letter);
      }
      original.replaceWith(wrapper);
      for (const letter of wrapper.children)
        letter.setAttribute("aria-hidden", "true");
      const readable = node("span", "workspace-write-readable");
      readable.append(original);
      wrapper.prepend(readable);
      runs.push({ wrapper, original });
    }
  }
  function placeholder(element, record) {
    if (element.value || !element.placeholder) return;
    const box = element.getBoundingClientRect(),
      style = getComputedStyle(element),
      mirror = node("div", "workspace-placeholder-mirror");
    Object.assign(mirror.style, {
      left:
        box.left +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft) +
        "px",
      top:
        box.top +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.paddingTop) +
        "px",
      width:
        box.width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        2 +
        "px",
      font: style.font,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      color: getComputedStyle(element, "::placeholder").color,
    });
    mirror.textContent = element.placeholder;
    layer.append(mirror);
    letters(mirror, record);
    record.mirror = mirror;
    element.classList.add("workspace-placeholder-writing");
    placeholders.push(element);
  }
  function paint(now) {
    if (finished) return;
    const elapsed = now - start;
    if (elapsed > DURATION) {
      finish();
      return;
    }
    const readings = [];
    for (const b of builders) {
      const time = elapsed - b.at;
      const draw = clamp(time / DRAW),
        type = clamp((time - DRAW - 110) / TYPE),
        count = Math.floor(type * b.letters.length);
      let distance = draw * b.total,
        point = null;
      for (const p of b.paths) {
        const part = clamp(distance / p.length);
        p.path.style.strokeDashoffset = String(p.length * (1 - part));
        if (!point && distance <= p.length)
          point = p.path.getPointAtLength(Math.max(0, distance));
        distance -= p.length;
      }
      if (!point && b.paths.length) {
        const p = b.paths.at(-1);
        point = p.path.getPointAtLength(p.length);
      }
      for (const element of b.reveal)
        element.style.opacity = String(clamp((time - DRAW + 170) / 220));
      for (let i = b.visible; i < count; i++) b.letters[i].style.opacity = "1";
      b.visible = count;
      if (type > 0 && count) {
        const box =
          b.letters[
            Math.min(count - 1, b.letters.length - 1)
          ].getBoundingClientRect();
        if (box.height) {
          point = { x: box.right + 1, y: box.bottom };
          b.caret.style.cssText = `left:${box.right}px;top:${box.top}px;height:${box.height}px;background:${b.color}`;
        }
      }
      readings.push({ b, time, type, point });
    }
    for (const { b, time, type, point } of readings) {
      b.cursor.style.opacity = String(
        time < 0
          ? 0
          : Math.min(
              clamp(time / 100),
              clamp((DRAW + 110 + TYPE + 430 - time) / 250),
            ),
      );
      b.group.style.opacity = String(
        time < 0
          ? 0
          : Math.min(1, clamp((DRAW + 110 + TYPE + 170 - time) / 300)),
      );
      b.label.textContent = b.name + (time < DRAW ? " · draw" : " · type");
      if (point) {
        b.cursor.dataset.flipX = String(point.x > innerWidth - 130);
        b.cursor.dataset.flipY = String(point.y > innerHeight - 60);
      }
      if (point)
        b.cursor.style.transform = `translate3d(${point.x - 3}px,${point.y - 2}px,0)`;
      b.caret.style.opacity = type > 0 && type < 1 ? "1" : "0";
      b.cursor.dataset.phase = time < DRAW ? "layout" : "text";
    }
    raf = requestAnimationFrame(paint);
  }
  function measure() {
    for (const b of builders) {
      b.total = 0;
      for (const p of b.paths) {
        const d = outline(p.target, p.edge);
        if (d) p.path.setAttribute("d", d);
        p.length = p.path.getTotalLength();
        p.path.style.strokeDasharray = String(p.length);
        b.total += p.length;
      }
    }
  }
  function prepare(root) {
    if (finished) return;
    if (
      motion.matches ||
      document.hidden ||
      typeof requestAnimationFrame !== "function"
    ) {
      finish();
      return;
    }
    if (start === null) {
      start = performance.now();
      layer = node("div", "workspace-build-layer");
      layer.setAttribute("aria-hidden", "true");
      sheet = svg("svg", {
        class: "workspace-layout-traces",
        width: "100%",
        height: "100%",
      });
      layer.append(sheet);
      document.body.append(layer);
      document.documentElement.dataset.workspaceAssembling = "true";
      window.addEventListener("pointerdown", finish, {
        capture: true,
        passive: true,
      });
      window.addEventListener("keydown", finish, true);
      window.addEventListener("wheel", finish, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", finish);
      document.addEventListener("visibilitychange", visibility);
      motion.addEventListener?.("change", finish);
      document.fonts?.ready.then(() => {
        if (!finished) measure();
      });
    }
    restore();
    sheet.replaceChildren();
    for (const b of builders) {
      b.cursor.remove();
      b.caret.remove();
      b.mirror?.remove();
    }
    builders = [];
    const parts =
      innerWidth <= 760
        ? BUILDERS.filter((b) => ["Layout", "Assistant"].includes(b.name))
        : BUILDERS;
    for (const definition of parts) {
      const b = {
        ...definition,
        paths: [],
        letters: [],
        visible: 0,
        total: 0,
        reveal: [],
      };
      b.group = svg("g", {
        "data-builder": b.name,
        stroke: b.color,
        fill: "none",
        "stroke-width": "1.25",
      });
      sheet.append(b.group);
      for (const [selector, edge] of b.lines)
        for (const target of root.querySelectorAll(selector)) {
          const d = outline(target, edge);
          if (!d) continue;
          const path = svg("path", {
            d,
            "data-layout-target": selector,
            "data-layout-edge": edge,
          });
          b.group.append(path);
          const length = path.getTotalLength();
          path.style.strokeDasharray = String(length);
          path.style.strokeDashoffset = String(length);
          b.paths.push({ path, length, target, edge });
          b.total += length;
        }
      if (!b.paths.length) {
        b.group.remove();
        continue;
      }
      for (const element of root.querySelectorAll(b.text)) letters(element, b);
      if (b.placeholder) {
        const input = root.querySelector(b.placeholder);
        if (input) placeholder(input, b);
      }
      for (const element of root.querySelectorAll(definition.reveal)) {
        hide(element);
        b.reveal.push(element);
      }
      b.cursor = node("div", "workspace-build-cursor");
      b.cursor.dataset.builder = b.name;
      b.cursor.style.setProperty("--builder-color", b.color);
      b.label = node("span", "workspace-build-label");
      b.cursor.append(arrow(b.color), b.label);
      b.caret = node("i", "workspace-build-caret");
      layer.append(b.cursor, b.caret);
      builders.push(b);
    }
    measure();
    cancelAnimationFrame(raf);
    paint(performance.now());
  }
  return { prepare, finish };
}
