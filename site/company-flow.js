// Deterministic dependency and condition semantics, shared by planner, runner and canvas.
export const terminalStep = (s) => ["completed", "skipped"].includes(s.state);
export function references(args) {
  const found = new Set();
  function visit(v, key = "") {
    if (Array.isArray(v)) {
      for (const x of v) visit(x, key);
      return;
    }
    if (v && typeof v === "object") {
      if (v.$step) found.add(v.$step);
      for (const [k, x] of Object.entries(v)) visit(x, k);
    } else if (
      ["from", "mediaFrom", "toolFrom", "sources"].includes(key) &&
      /^step-\d+$/.test(v || "")
    )
      found.add(v);
  }
  visit(args);
  return [...found];
}
export function flowMetadata(s, i, offset = 0) {
  const prior = "step-" + (offset + i),
    explicit = s.dependsOn;
  if (
    explicit !== undefined &&
    (!Array.isArray(explicit) ||
      explicit.length > 24 ||
      explicit.some((x) => !/^step-\d+$/.test(x)))
  )
    throw Error("Dependencies must be a list of prior step IDs.");
  const deps = [
    ...new Set([
      ...(explicit ?? (offset + i > 0 ? [prior] : [])),
      ...references(s.args),
      ...(s.when ? [s.when.step] : []),
    ]),
  ];
  if (
    deps.some(
      (id) =>
        !/^step-\d+$/.test(id) ||
        Number(id.slice(5)) >= offset + i + 1 ||
        Number(id.slice(5)) < 1,
    )
  )
    throw Error(
      "Workflow dependencies must refer to earlier steps; cycles and forward references are not allowed.",
    );
  if (s.when) validatePredicate(s.when, true);
  if (
    s.operation !== undefined &&
    (typeof s.operation !== "string" || s.operation.length > 80)
  )
    throw Error("Operation names must be under 80 characters.");
  return {
    dependsOn: deps,
    ...(s.when ? { when: s.when } : {}),
    ...(s.operation ? { operation: s.operation } : {}),
  };
}
const scalar = (x) =>
  x === null || ["string", "number", "boolean"].includes(typeof x);
export function validatePredicate(p, upstream = false) {
  if (
    !p ||
    !["eq", "ne", "gt", "gte", "lt", "lte", "exists", "not_empty"].includes(
      p.op,
    ) ||
    !scalar(p.value ?? null) ||
    (upstream &&
      (!/^step-\d+$/.test(p.step || "") ||
        typeof (p.path ?? "") !== "string" ||
        (p.path || "").length > 200))
  )
    throw Error("Use a bounded condition with an explicit comparison.");
}
export function atPath(value, path = "") {
  for (const part of String(path).split(".").filter(Boolean)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(part) ||
      value == null ||
      !Object.hasOwn(Object(value), part)
    )
      return undefined;
    value = value[part];
  }
  return value;
}
export function compare(left, op, right) {
  switch (op) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "gt":
      return (
        typeof left === "number" && typeof right === "number" && left > right
      );
    case "gte":
      return (
        typeof left === "number" && typeof right === "number" && left >= right
      );
    case "lt":
      return (
        typeof left === "number" && typeof right === "number" && left < right
      );
    case "lte":
      return (
        typeof left === "number" && typeof right === "number" && left <= right
      );
    case "exists":
      return left !== undefined && left !== null;
    case "not_empty":
      return Array.isArray(left) || typeof left === "string"
        ? left.length > 0
        : left !== null && left !== undefined;
    default:
      throw Error("Unknown condition operator.");
  }
}
export function whenMatches(when, steps) {
  if (!when) return true;
  const source = steps.find(
    (s) => s.id === when.step && s.state === "completed",
  );
  return (
    !!source && compare(atPath(source.result, when.path), when.op, when.value)
  );
}
export function dependencies(s, steps) {
  if (s.dependsOn) return s.dependsOn;
  const i = steps.indexOf(s);
  return i > 0 ? [steps[i - 1].id] : [];
}
export function readySteps(steps, now = Date.now(), limit = 2) {
  const ready = [],
    usedDevices = new Set();
  for (const s of steps) {
    if (
      terminalStep(s) ||
      s.state === "uncertain" ||
      (s.nextAttemptAt || 0) > now
    )
      continue;
    const upstream = dependencies(s, steps).map((id) =>
      steps.find((p) => p.id === id),
    );
    if (upstream.some((p) => !p || !terminalStep(p))) continue;
    if (
      (upstream.some((p) => p.state === "skipped") && s.tool !== "join") ||
      !whenMatches(s.when, steps)
    ) {
      s.state = "skipped";
      s.result = {
        skipped: true,
        reason: "The selected condition/dependency did not enter this branch.",
      };
      continue;
    }
    const lock = s.deviceLock;
    if (lock && usedDevices.has(lock)) continue;
    if (lock) usedDevices.add(lock);
    ready.push(s);
    if (ready.length === limit) break;
  }
  return ready;
}
export function flowScope(s) {
  return {
    dependsOn: s.dependsOn || null,
    when: s.when || null,
    operation: s.operation || null,
  };
}
export function flowLayout(steps) {
  const levels = new Map(),
    groups = [];
  for (const s of steps) {
    const level =
      Math.max(
        -1,
        ...dependencies(s, steps).map((id) => levels.get(id) ?? -1),
      ) + 1;
    levels.set(s.id, level);
    (groups[level] ??= []).push(s);
  }
  let y = 130;
  const positions = new Map();
  groups.forEach((group, level) => {
    group.forEach((s, i) =>
      positions.set(s.id, {
        x: group.length === 1 ? 220 : i % 2 ? 530 : 60,
        y: y + Math.floor(i / 2) * 190,
        w: group.length === 1 ? 560 : 410,
        level,
      }),
    );
    y += Math.ceil(group.length / 2) * 190 + 15;
  });
  return { positions, groups, height: Math.max(260, y + 20) };
}
const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
export const sameFlow = (a, b) =>
  JSON.stringify(stable(a)) === JSON.stringify(stable(b));
export function delivers(step, expectation) {
  if (expectation === "publish") return step.tool === "publish";
  if (expectation === "media") return step.tool === "media";
  if (expectation === "data")
    return ["query", "source", "join"].includes(step.tool);
  if (expectation === "report") return step.tool === "report";
  if (expectation === "server_tool") return step.tool === "bridge";
  return step.tool === "export" && step.args?.format === expectation;
}
