const paths = {
  plug: "M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-6 6v4m-6-10H4m14 0h2",
  workflow: "M5 4h5v5H5zM14 15h5v5h-5zM7.5 9v8H14m-4-10h7v8",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  files: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7m-7 4h7",
  input: "M4 4h16v16H4zM8 9l3 3-3 3m5 0h4",
  output: "M4 4h16v16H4zM8 12h8m-3-3l3 3-3 3",
  focus: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-2 4l6 6",
  expand: "M5 9V5h4m6 0h4v4M5 15v4h4m6 0h4v-4",
};
export function workspaceIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "workspace-icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name] || paths.workflow);
  svg.append(path);
  return svg;
}
export function preference(name, fallback) {
  try {
    const value = Number(localStorage.getItem("th.workspace." + name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}
export function attachSplitter(
  handle,
  {
    shell,
    property,
    axis = "x",
    min = 320,
    max = 640,
    value,
    onChange,
    onResizeState,
  },
) {
  handle.setAttribute("role", "separator");
  handle.setAttribute("tabindex", "0");
  handle.setAttribute(
    "aria-orientation",
    axis === "x" ? "vertical" : "horizontal",
  );
  handle.setAttribute(
    "aria-label",
    axis === "x" ? "Resize assistant panel" : "Resize details panel",
  );
  function bounds() {
    return Math.max(
      min,
      Math.min(
        max,
        axis === "x" ? shell.clientWidth - 460 : shell.clientHeight * 0.55,
      ),
    );
  }
  function update(next) {
    value = Math.max(min, Math.min(bounds(), next));
    shell.style.setProperty(property, value + "px");
    handle.setAttribute("aria-valuenow", Math.round(value));
    handle.setAttribute("aria-valuemin", min);
    handle.setAttribute("aria-valuemax", Math.round(bounds()));
    onChange?.(value);
  }
  function save() {
    try {
      localStorage.setItem(
        "th.workspace." + (axis === "x" ? "assistantWidth" : "detailsHeight"),
        Math.round(value),
      );
    } catch {}
  }
  update(value);
  handle.onkeydown = (e) => {
    const increase = axis === "x" ? "ArrowRight" : "ArrowUp",
      decrease = axis === "x" ? "ArrowLeft" : "ArrowDown";
    if ([increase, decrease, "Home", "End"].includes(e.key)) {
      e.preventDefault();
      update(
        e.key === "Home"
          ? min
          : e.key === "End"
            ? bounds()
            : value + (e.key === increase ? 20 : -20),
      );
      save();
    }
  };
  handle.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    onResizeState?.(true);
    const start = axis === "x" ? e.clientX : e.clientY,
      initial = value;
    let frame = 0,
      pending = value;
    document.documentElement.classList.add(
      axis === "x" ? "resize-columns" : "resize-rows",
    );
    const move = (ev) => {
      pending =
        initial +
        ((axis === "x" ? ev.clientX : ev.clientY) - start) *
          (axis === "x" ? 1 : -1);
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          update(pending);
        });
    };
    const done = () => {
      cancelAnimationFrame(frame);
      update(pending);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", done);
      handle.removeEventListener("pointercancel", done);
      document.documentElement.classList.remove(
        "resize-columns",
        "resize-rows",
      );
      save();
      onResizeState?.(false);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", done);
    handle.addEventListener("pointercancel", done);
  };
}
