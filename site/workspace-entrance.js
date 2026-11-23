const svgNS = "http://www.w3.org/2000/svg";
const duration = 2450;
const parts = [
  {
    selector: ".desk-header",
    label: "Layout",
    color: "#168aa0",
    at: 30,
    x: 0.7,
    y: 0.55,
  },
  {
    selector: ".assistant-desk",
    label: "Assistant",
    color: "#6c62c5",
    at: 190,
    x: 0.6,
    y: 0.32,
  },
  {
    selector: ".work-desk",
    label: "Workflow",
    color: "#16876c",
    at: 410,
    x: 0.53,
    y: 0.42,
  },
  {
    selector: ".assistant-compose",
    label: "Controls",
    color: "#b57b28",
    at: 650,
    x: 0.72,
    y: 0.5,
  },
];
function element(tag, cls) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
function arrow(color) {
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 28 32");
  const p = document.createElementNS(svgNS, "path");
  p.setAttribute("d", "M3 2L24 20L14 21L10 30Z");
  p.setAttribute("fill", color);
  p.setAttribute("stroke", "white");
  p.setAttribute("stroke-width", "2");
  p.setAttribute("stroke-linejoin", "round");
  svg.append(p);
  return svg;
}
// One short document entrance, independent of polling/re-rendering. No model calls.
export function createWorkspaceEntrance() {
  let start = null,
    finished = false,
    layer = null,
    timer = null;
  const motion = matchMedia("(prefers-reduced-motion: reduce)"),
    animations = new Set(),
    animated = new WeakSet(),
    guides = [];
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    for (const animation of animations) animation.cancel();
    animations.clear();
    layer?.remove();
    layer = null;
    document.documentElement.removeAttribute("data-workspace-assembling");
    window.removeEventListener("pointerdown", finish, true);
    window.removeEventListener("keydown", finish, true);
    window.removeEventListener("resize", finish);
    document.removeEventListener("visibilitychange", visibility);
    motion.removeEventListener("change", finish);
  }
  function visibility() {
    if (document.hidden) finish();
  }
  function animate(node, frames, options) {
    const a = node.animate(frames, options);
    animations.add(a);
    return a;
  }
  function prepare(root) {
    if (finished) return;
    if (
      motion.matches ||
      document.hidden ||
      typeof Element.prototype.animate !== "function"
    ) {
      finish();
      return;
    }
    if (start === null) {
      start = performance.now();
      layer = element("div", "workspace-build-layer");
      layer.setAttribute("aria-hidden", "true");
      document.body.append(layer);
      document.documentElement.dataset.workspaceAssembling = "true";
      window.addEventListener("pointerdown", finish, {
        capture: true,
        passive: true,
      });
      window.addEventListener("keydown", finish, true);
      window.addEventListener("resize", finish);
      document.addEventListener("visibilitychange", visibility);
      motion.addEventListener("change", finish);
      timer = setTimeout(finish, duration);
    }
    const elapsed = performance.now() - start;
    if (elapsed >= duration) {
      finish();
      return;
    }
    const selected =
      innerWidth <= 760
        ? parts.filter((p) => ["Layout", "Assistant"].includes(p.label))
        : parts;
    for (const part of selected) {
      const target = root.querySelector(part.selector);
      if (!target) continue;
      const box = target.getBoundingClientRect();
      if (box.width < 10 || box.height < 10) continue;
      if (!animated.has(target)) {
        animated.add(target);
        if (elapsed < part.at + 680)
          animate(
            target,
            [
              {
                opacity: 0.12,
                transform: "translateY(12px)",
                clipPath: "inset(0 0 90% 0 round 8px)",
              },
              {
                opacity: 1,
                transform: "translateY(0)",
                clipPath: "inset(0 0 0% 0 round 8px)",
              },
            ],
            {
              duration: 680,
              delay: part.at - elapsed,
              easing: "cubic-bezier(.2,.75,.2,1)",
              fill: "both",
            },
          );
      }
      if (guides.some((g) => g.label === part.label)) continue;
      const cursor = element("div", "workspace-build-cursor");
      cursor.style.setProperty("--builder-color", part.color);
      cursor.dataset.builder = part.label;
      const label = element("span", "workspace-build-label");
      label.textContent = part.label;
      cursor.append(arrow(part.color), label);
      const frame = element("div", "workspace-build-frame");
      frame.style.setProperty("--builder-color", part.color);
      Object.assign(frame.style, {
        left: box.left + "px",
        top: box.top + "px",
        width: box.width + "px",
        height: box.height + "px",
      });
      const cross = element("i", "workspace-build-cross");
      frame.append(cross);
      layer.append(frame, cursor);
      guides.push({ label: part.label });
      const x = box.left + box.width * part.x,
        y = box.top + Math.min(box.height * part.y, 220);
      const bounded = (v, max) => Math.max(10, Math.min(v, max));
      const point = (dx, dy, s = 1) =>
        `translate3d(${bounded(x + dx, innerWidth - 110)}px,${bounded(y + dy, innerHeight - 50)}px,0) scale(${s})`;
      animate(
        cursor,
        [
          { offset: 0, opacity: 0, transform: point(-70, -35) },
          { offset: 0.1, opacity: 1, transform: point(-25, -12) },
          { offset: 0.26, opacity: 1, transform: point(0, 0) },
          { offset: 0.32, opacity: 1, transform: point(0, 0, 0.86) },
          { offset: 0.4, opacity: 1, transform: point(0, 0) },
          {
            offset: 0.7,
            opacity: 1,
            transform: point(
              Math.min(box.width * 0.14, 90),
              Math.min(box.height * 0.12, 35),
            ),
          },
          {
            offset: 0.8,
            opacity: 1,
            transform: point(
              Math.min(box.width * 0.14, 90),
              Math.min(box.height * 0.12, 35),
              0.87,
            ),
          },
          {
            offset: 1,
            opacity: 0,
            transform: point(
              Math.min(box.width * 0.14, 90) + 24,
              Math.min(box.height * 0.12, 35) - 20,
            ),
          },
        ],
        {
          duration: 1500,
          delay: part.at - elapsed,
          easing: "cubic-bezier(.25,.65,.25,1)",
          fill: "both",
        },
      );
      animate(
        frame,
        [
          { opacity: 0, clipPath: "inset(0 100% 0 0)" },
          { opacity: 0.8, clipPath: "inset(0 0% 0 0)", offset: 0.32 },
          { opacity: 0.45, offset: 0.7 },
          { opacity: 0, clipPath: "inset(0 0% 0 0)" },
        ],
        {
          duration: 1450,
          delay: part.at - elapsed,
          easing: "ease-out",
          fill: "both",
        },
      );
    }
  }
  return { prepare, finish };
}
