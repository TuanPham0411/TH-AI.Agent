export function attachModelPicker({
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
  hasSavedKey,
}) {
  const panel = el("div", "", "model-catalog"),
    status = el(
      "p",
      "Models are loaded from the selected provider using this role’s saved API key.",
      "connector-help",
    );
  const choose = field(panel, slot + " available models", "", {
    options: [["", "Load provider models to choose…"]],
  });
  const meta = el("p", "", "model-details");
  let models = [],
    sequence = 0,
    lastChecked = null;
  function selected() {
    const selected = models.find((m) => m.id === model.value);
    meta.textContent = selected
      ? [
          selected.name || selected.id,
          ...(selected.version ? ["Version: " + selected.version] : []),
          ...(selected.inputTokenLimit
            ? ["Input limit: " + selected.inputTokenLimit]
            : []),
          selected.description || "",
        ].join(" · ")
      : "Exact model ID is preserved. A model list does not prove inference access or available quota.";
  }
  choose.onchange = () => {
    if (choose.value) {
      model.value = choose.value;
      selected();
    }
  };
  model.addEventListener("input", selected);
  async function load(saveKey = false) {
    const ticket = ++sequence,
      selectedProvider = provider.value;
    status.textContent = "Refreshing live provider models…";
    try {
      if (saveKey && key.value) {
        await sendJSON(
          "company/model-key/" + slot,
          { provider: selectedProvider, key: key.value },
          "PUT",
        );
        key.value = "";
        key.placeholder = "Saved · leave blank to keep it";
      }
      const value = await api(
        "company/models/" + slot + "/" + selectedProvider + "?refresh=1",
      );
      if (
        ticket !== sequence ||
        provider.value !== selectedProvider ||
        !area.isConnected
      )
        return;
      models = value.models;
      lastChecked = value.checkedAt;
      choose.replaceChildren(
        new Option("Choose a model · current: " + model.value, ""),
      );
      for (const item of models)
        choose.append(
          new Option(
            (item.name || item.id) +
              (item.version ? " · " + item.version : "") +
              (item.name && item.name !== item.id ? " — " + item.id : ""),
            item.id,
          ),
        );
      choose.value = models.some((m) => m.id === model.value)
        ? model.value
        : "";
      status.textContent =
        models.length +
        " account-visible models · checked " +
        new Date(lastChecked).toLocaleString() +
        ". Refreshes every 5 minutes while setup is open. Your chosen model is never changed automatically.";
      selected();
    } catch (error) {
      if (ticket === sequence) {
        status.textContent =
          error.message +
          (lastChecked
            ? " Last successful list: " +
              new Date(lastChecked).toLocaleString() +
              "."
            : "");
      }
    }
  }
  panel.append(
    button("Save key / refresh models", () => load(true), "quiet-button"),
    status,
    meta,
  );
  area.append(panel);
  provider.addEventListener("change", () => {
    sequence++;
    models = [];
    key.value = "";
    choose.replaceChildren(new Option("Load models for " + provider.value, ""));
    meta.textContent =
      "Choose a model supported by the selected provider. The exact ID above has not been replaced.";
    void load();
  });
  const timer = setInterval(() => {
    if (!area.isConnected || !area.closest("dialog")?.open) {
      clearInterval(timer);
      return;
    }
    if (!document.hidden && !key.value) void load();
  }, 300000);
  area
    .closest("dialog")
    ?.addEventListener("close", () => clearInterval(timer), { once: true });
  if (hasSavedKey) queueMicrotask(() => void load());
  return { refresh: load };
}
