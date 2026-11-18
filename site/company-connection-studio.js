import { connectionTypes, connectionGroups } from "./company-connections.js";
export function createConnectionStudio({
  api,
  sendJSON,
  modal,
  field,
  el,
  button,
  refresh,
  notice,
  getData,
}) {
  let devices = [];
  const testSavedConnection = (id) =>
    api("company/connections/" + encodeURIComponent(id) + "/check", {
      method: "POST",
      body: "{}",
      signal: AbortSignal.timeout(60000),
    });
  function open(title, build) {
    document.querySelector("#modal").close();
    modal(title, build);
    document.querySelector("#modal").classList.add("connection-dialog");
  }
  const badge = (text, cls = "") => el("span", text, "connector-badge " + cls);
  function note(host, text, cls = "connector-help") {
    host.append(el("p", text, cls));
  }
  async function loadDevices() {
    devices = (await api("company/devices")).devices;
  }
  async function list() {
    open("Your working environment", (host) => {
      note(
        host,
        "Different tools need different credentials, permissions and places to run. Configure each once; your assistant uses the verified capability.",
      );
      const targets = el("details", "", "connector-advanced");
      targets.append(el("summary", "Where your tools run"));
      for (const [title, text] of [
        [
          "Your computer",
          "Office, text editors, browsers, files/folders/shared drives, Access/ODBC and local coding tools belong to the paired client. Only actions reported/configured by that client are callable. Installed ChatGPT/Codex UI applications are distinct from API access.",
        ],
        [
          "Shared server",
          "Shared network/database services and verified server tools run independently of the laptop.",
        ],
        [
          "Online / personal APIs",
          "Google services, Facebook, TikTok, Canva, GitHub and WhatsApp use their own API authentication, scopes and supported adapters. A personal desktop login is not an API credential.",
        ],
      ]) {
        targets.append(el("strong", title));
        note(targets, text);
      }
      host.append(targets);
      const bar = el("div", "", "connection-toolbar");
      bar.append(
        button("Pair / manage a computer", () => deviceManager(), "ink-button"),
        button("＋ Add a connection", () => gallery(), "quiet-button"),
      );
      host.append(bar);
      const connections = getData()?.connections || [];
      for (const group of connectionGroups) {
        const items = connections.filter(
          (c) => connectionTypes[c.kind]?.group === group,
        );
        if (!items.length) continue;
        host.append(el("h3", group, "connector-group-title"));
        const grid = el("div", "", "connected-grid");
        for (const c of items) {
          const def = connectionTypes[c.kind],
            card = el("article", "", "connected-card");
          const top = el("div", "", "connector-card-top");
          top.append(
            el("span", def.icon, "connector-icon"),
            el("h4", c.name),
            badge(
              c.verifiedAt || c.check?.verified ? "Checked" : "Not checked",
              c.verifiedAt || c.check?.verified ? "verified" : "",
            ),
          );
          card.append(
            top,
            el("p", def.title + " · " + c.id),
            el(
              "p",
              c.kind === "bridge" || c.transport === "device"
                ? (c.execution || "unverified") +
                    " · " +
                    (c.unattended
                      ? "server automation eligible"
                      : "online/manual use only")
                : c.requestPath ||
                    c.dsn ||
                    c.accountId ||
                    c.database ||
                    def.summary,
            ),
          );
          const controls = el("div", "", "connection-toolbar");
          controls.append(
            button("Configure", () => form(c), "quiet-button"),
            button(
              "Test connection",
              async () => {
                const result = await testSavedConnection(c.id);
                notice(
                  result.note ||
                    (result.execution === "server" && result.unattended
                      ? "Server verified."
                      : "Computer verified; desktop tools need this computer online."),
                );
                await refresh();
                await list();
              },
              "quiet-button",
            ),
          );
          card.append(controls);
          grid.append(card);
        }
        host.append(grid);
      }
      if (!connections.length) {
        note(
          host,
          "No tools connected yet. Choose the service you actually use.",
        );
        renderGallery(host);
      }
    });
  }
  function renderGallery(host) {
    for (const group of connectionGroups) {
      host.append(el("h3", group, "connector-group-title"));
      const grid = el("div", "", "connector-gallery");
      for (const [kind, d] of Object.entries(connectionTypes).filter(
        ([, d]) => d.group === group,
      )) {
        const card = button("", () => form(null, { kind }), "connector-choice");
        card.append(
          el("span", d.icon, "connector-icon"),
          el("strong", d.title),
          el("span", d.summary),
        );
        grid.append(card);
      }
      host.append(grid);
    }
  }
  function gallery() {
    open("Choose a connection", (host) => {
      note(
        host,
        "Choose a service to see its own setup, required permissions and supported operations.",
      );
      renderGallery(host);
    });
  }
  async function form(existing = null, need = {}) {
    if (["bridge", "odbc"].includes(existing?.kind || need.kind))
      await loadDevices();
    open(existing ? "Configure " + existing.name : "Connect a tool", (host) => {
      const options = Object.entries(connectionTypes).map(([k, d]) => [
          k,
          d.title,
        ]),
        initial =
          existing?.kind || (connectionTypes[need.kind] ? need.kind : "odbc");
      const shell = el("div", "", "connector-form-layout"),
        main = el("div", "", "connector-form-main"),
        aside = el("aside", "", "connector-guide");
      shell.append(main, aside);
      host.append(shell);
      const kind = field(main, "Connection type", initial, { options });
      if (existing) kind.disabled = true;
      const identity = el("div", "", "connector-field-grid");
      main.append(identity);
      const id = field(
        identity,
        "Connection ID",
        existing?.id ||
          String(need.name || "")
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "")
            .slice(0, 60),
      );
      if (existing) id.disabled = true;
      const name = field(
        identity,
        "Display name",
        existing?.name || need.name || "",
      );
      const conditional = el("div", "", "connector-settings");
      main.append(conditional);
      let fields = {},
        transport,
        device;
      function details() {
        conditional.replaceChildren();
        aside.replaceChildren();
        fields = {};
        const def = connectionTypes[kind.value];
        aside.append(
          el("span", def.icon, "connector-icon large"),
          el("h3", def.title),
        );
        note(aside, def.summary);
        aside.append(el("h4", "What you need"));
        note(aside, def.auth);
        aside.append(el("h4", "Where it runs"));
        note(
          aside,
          kind.value === "odbc"
            ? "Paired-computer mode uses the Windows driver/DSN on that computer, which must stay online. HTTPS mode uses your separately installed gateway. The Pi does not directly read a Windows DSN."
            : kind.value === "bridge"
              ? "On your paired computer. It must be online and awake. Portability assessment can move suitable Python tools to a verified server."
              : "On the server, using the saved account and network route. Your browser tab is not the worker.",
        );
        aside.append(el("h4", "Private credentials"));
        note(
          aside,
          "Saved in the server vault. Existing passwords/tokens are never sent back to this form or included in model context. Blank private fields preserve saved values.",
        );
        if (def.docs) {
          const a = el("a", "Official setup / permissions →");
          a.href = def.docs;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          aside.append(a);
        }
        if (kind.value === "bridge") {
          bridgeFields();
          return;
        }
        if (kind.value === "odbc") {
          odbcFields();
          return;
        }
        const grid = el("div", "", "connector-field-grid");
        conditional.append(grid);
        for (const spec of def.fields) {
          const control = field(
            grid,
            spec.label,
            spec.private
              ? ""
              : (existing?.[spec.key] ??
                  spec.default ??
                  spec.options?.[0]?.[0] ??
                  ""),
            {
              secret: spec.secret,
              options: spec.options,
              type: spec.type || "text",
              rows: spec.rows,
            },
          );
          control.dataset.configField = spec.key;
          if (spec.private && existing)
            control.placeholder = "Saved · leave blank to preserve";
          else if (spec.placeholder) control.placeholder = spec.placeholder;
          if (spec.type === "checkbox")
            control.checked = !!(existing?.[spec.key] ?? spec.default);
          if (spec.required && !existing) control.required = true;
          fields[spec.key] = { control, spec };
        }
        if (def.scheme) {
          const advanced = el("details", "", "connector-advanced");
          advanced.append(
            el("summary", "Advanced / preserve an existing driver connection"),
          );
          note(
            advanced,
            "For an older URI-only connection, leave host fields empty to preserve it. Providing host settings rebuilds the driver connection with saved private fields.",
          );
          const control = field(
            advanced,
            "Private driver URI / JSON override",
            "",
            { secret: true },
          );
          control.placeholder = existing
            ? "Saved · leave blank to preserve"
            : "";
          fields.connectionString = {
            control,
            spec: { key: "connectionString", private: true },
          };
          conditional.append(advanced);
        }
        if (kind.value === "network") {
          const updateAuth = () => {
            for (const key of ["username", "key"]) {
              const n = fields[key].control.closest("label");
              n.hidden =
                fields.auth.control.value === "none" ||
                (key === "username" && fields.auth.control.value !== "basic");
            }
          };
          fields.auth.control.onchange = updateAuth;
          updateAuth();
        }
      }
      function odbcFields() {
        const guide = el("a", "Windows / Oracle DSN setup guide →");
        guide.href = "/odbc-setup.html";
        guide.target = "_blank";
        guide.rel = "noopener";
        conditional.append(guide);
        transport = field(
          conditional,
          "ODBC connection method",
          existing?.transport || (existing ? "https" : "device"),
          {
            options: [
              ["device", "DSN on a paired computer"],
              ["https", "Existing HTTPS gateway"],
            ],
          },
        );
        const body = el("div");
        conditional.append(body);
        function draw() {
          body.replaceChildren();
          fields = {};
          if (transport.value === "https") {
            for (const spec of connectionTypes.odbc.fields) {
              const control = field(
                body,
                spec.label,
                spec.private ? "" : existing?.[spec.key] || "",
                spec,
              );
              if (spec.private && existing)
                control.placeholder = "Saved · leave blank to preserve";
              fields[spec.key] = { control, spec };
            }
            note(
              body,
              "This mode requires an already installed HTTPS gateway implementing /query. A DSN name or Oracle TNS alias is not a URL.",
            );
            return;
          }
          const active = devices.filter((d) => !d.revoked);
          device = field(
            body,
            "Computer containing this DSN",
            existing?.deviceId || active[0]?.id || "",
            {
              options: active.length
                ? active.map((d) => [
                    d.id,
                    d.name + " · " + (d.online ? "online" : "offline"),
                  ])
                : [["", "Pair a computer first"]],
            },
          );
          body.append(
            button(
              "Pair / manage a computer",
              () => deviceManager(),
              "quiet-button",
            ),
          );
          const detail = el("div");
          body.append(detail);
          function settings() {
            detail.replaceChildren();
            const d = active.find((d) => d.id === device.value),
              info = d?.capabilities?.odbc;
            note(
              detail,
              info?.available
                ? "ODBC available · Python " +
                    info.bitness +
                    "-bit · " +
                    info.dataSources.length +
                    " visible DSNs. Driver and Python architectures must match."
                : "ODBC support has not been reported. Install/update the agent with -EnableOdbc, start it under the Windows account that owns the DSN, then refresh devices.",
            );
            if (info?.drivers?.length)
              note(detail, "Detected drivers: " + info.drivers.join(" · "));
            const dsn = field(detail, "DSN name", existing?.dsn || "");
            dsn.placeholder = "odssg_vn";
            const datalist = el("datalist");
            datalist.id = "dsn-" + crypto.randomUUID();
            for (const item of info?.dataSources || []) {
              const option = new Option(item.driver, item.name);
              datalist.append(option);
            }
            dsn.setAttribute("list", datalist.id);
            detail.append(datalist);
            const dialect = field(
              detail,
              "Database dialect",
              existing?.dialect || "oracle",
              {
                options: [
                  ["oracle", "Oracle"],
                  ["sqlserver", "Microsoft SQL Server"],
                  ["postgres", "PostgreSQL"],
                  ["mysql", "MySQL"],
                  ["other", "Other ODBC database"],
                ],
              },
            );
            const auth = field(
              detail,
              "Database authentication",
              existing?.auth || "credentials",
              {
                options: [
                  ["credentials", "Database user ID and password"],
                  ["dsn", "Use authentication already configured in the DSN"],
                ],
              },
            );
            const username = field(detail, "Database user ID", "");
            const password = field(detail, "Database password", "", {
              secret: true,
            });
            if (existing) {
              username.placeholder = "Saved · leave blank to preserve";
              password.placeholder = "Saved · leave blank to preserve";
            }
            function authentication() {
              username.closest("label").hidden = password.closest(
                "label",
              ).hidden = auth.value !== "credentials";
            }
            auth.onchange = authentication;
            authentication();
            dsn.onchange = () => {
              if (!id.value)
                id.value = dsn.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_-]/g, "")
                  .slice(0, 60);
              if (!name.value) name.value = dsn.value;
              const driver = info?.dataSources?.find(
                (s) => s.name === dsn.value,
              )?.driver;
              if (/oracle/i.test(driver || "")) dialect.value = "oracle";
            };
            for (const [key, control] of Object.entries({
              dsn,
              dialect,
              auth,
              username,
              password,
            }))
              fields[key] = {
                control,
                spec: { key, private: ["username", "password"].includes(key) },
              };
            note(
              detail,
              "Keep your existing Oracle TNS Service Name (for example SGPODS) in the Windows DSN. It does not go in a URL field. Read queries execute on this computer. A read-only account is required.",
            );
            note(
              detail,
              "Windows ODBC Administrator: System32\\odbcad32.exe is 64-bit; SysWOW64\\odbcad32.exe is 32-bit. Open the one matching your Python/driver.",
            );
          }
          device.onchange = settings;
          settings();
        }
        transport.onchange = draw;
        draw();
      }
      function bridgeFields() {
        transport = field(
          conditional,
          "Computer connection",
          existing?.transport ||
            (existing && !existing.deviceId ? "https" : "device"),
          {
            options: [
              ["device", "Paired device · outbound link"],
              ["https", "Existing HTTPS bridge"],
            ],
          },
        );
        const body = el("div");
        conditional.append(body);
        function draw() {
          body.replaceChildren();
          fields = {};
          if (transport.value === "device") {
            const active = devices.filter((d) => !d.revoked);
            device = field(
              body,
              "Paired computer",
              existing?.deviceId || active[0]?.id || "",
              {
                options: active.length
                  ? active.map((d) => [
                      d.id,
                      d.name + " · " + (d.online ? "online" : "offline"),
                    ])
                  : [["", "Pair a computer first"]],
              },
            );
            body.append(
              button(
                "Pair / manage a computer",
                () => deviceManager(),
                "quiet-button",
              ),
            );
            const target = el("div");
            body.append(target);
            function actions() {
              target.replaceChildren();
              const d = active.find((d) => d.id === device.value),
                caps = d?.capabilities?.actions || [];
              note(
                target,
                d
                  ? (d.online ? "Computer online. " : "Computer offline. ") +
                      (d.capabilities.fullControl
                        ? "Full account-level control granted locally."
                        : "Only configured local actions are available.")
                  : "Pair and start the device agent, then refresh to load its actions.",
              );
              const action = field(
                target,
                "Approved action ID",
                existing?.action || caps[0]?.id || "",
                {
                  options: caps.length
                    ? caps.map((a) => [a.id, a.id])
                    : [["", "No action reported yet"]],
                },
              );
              const desc = field(
                target,
                "Action skill / input description",
                existing?.description ||
                  caps.find((a) => a.id === action.value)?.description ||
                  "",
                { rows: 4 },
              );
              const effect = field(
                target,
                "Action effect",
                caps.find((a) => a.id === action.value)?.effect || "write",
                {
                  options: [
                    ["read", "Read-only"],
                    ["write", "Writes / controls this computer"],
                  ],
                },
              );
              effect.disabled = true;
              action.onchange = () => {
                const a = caps.find((a) => a.id === action.value);
                desc.value = a?.description || "";
                effect.value = a?.effect || "write";
              };
              fields.action = { control: action, spec: { key: "action" } };
              fields.description = {
                control: desc,
                spec: { key: "description" },
              };
              fields.effect = { control: effect, spec: { key: "effect" } };
            }
            device.onchange = actions;
            actions();
          } else {
            for (const spec of [
              { key: "baseUrl", label: "HTTPS gateway URL", type: "url" },
              { key: "action", label: "Approved action ID" },
              {
                key: "description",
                label: "Action skill / input description",
                rows: 4,
              },
              {
                key: "effect",
                label: "Action effect",
                options: [
                  ["read", "Read-only"],
                  ["write", "Writes / controls a local tool"],
                ],
              },
              {
                key: "key",
                label: "Private access token",
                private: true,
                secret: true,
              },
            ]) {
              const control = field(
                body,
                spec.label,
                spec.private ? "" : existing?.[spec.key] || "",
                spec,
              );
              if (spec.private && existing)
                control.placeholder = "Saved · leave blank to preserve";
              fields[spec.key] = { control, spec };
            }
            const help = el("a", "HTTPS bridge setup →");
            help.href = "/bridge-setup.html";
            help.target = "_blank";
            help.rel = "noopener";
            body.append(help);
          }
          const allow = field(
            body,
            "Allow this assistant to invoke this approved action without asking each time",
            "",
            { type: "checkbox" },
          );
          allow.checked = !!existing?.allowWrites;
          fields.allowWrites = { control: allow, spec: { key: "allowWrites" } };
        }
        transport.onchange = draw;
        draw();
      }
      kind.onchange = async () => {
        if (["bridge", "odbc"].includes(kind.value)) await loadDevices();
        details();
      };
      details();
      const status = el("p", "", "setup-status"),
        controls = el("div", "", "connection-toolbar");
      main.append(status, controls);
      controls.append(
        button(
          "Save secure connection",
          async () => {
            const body = {
              kind: kind.value,
              name: name.value,
              revision: existing?.revision || 0,
              secret: {},
            };
            for (const [key, { control, spec }] of Object.entries(fields)) {
              const value =
                control.type === "checkbox" ? control.checked : control.value;
              if (spec.private) body.secret[key] = value;
              else body[key] = value;
            }
            if (["bridge", "odbc"].includes(kind.value)) {
              body.transport = transport.value;
              if (transport.value === "device") body.deviceId = device.value;
            }
            await sendJSON(
              "company/connections/" + encodeURIComponent(id.value),
              body,
              "PUT",
            );
            for (const { control, spec } of Object.values(fields))
              if (spec.private) control.value = "";
            status.textContent =
              "Saved securely. Continue the waiting work from your assistant.";
            await refresh();
            existing = getData().connections.find((c) => c.id === id.value);
            id.disabled = true;
          },
          "ink-button",
        ),
        button(
          "Test saved connection",
          async () => {
            status.textContent = "Testing the saved connection…";
            try {
              const r = await testSavedConnection(id.value);
              status.textContent =
                r.note ||
                (r.execution === "server" && r.unattended
                  ? "Server verified for unattended work."
                  : "Computer verified. Desktop tools need this computer online.");
              await refresh();
              existing = getData().connections.find((c) => c.id === id.value);
            } catch (e) {
              status.textContent = e.message;
            }
          },
          "quiet-button",
        ),
        button("All connections", () => list(), "text-button"),
      );
    });
  }
  async function deviceManager() {
    await loadDevices();
    open("Connect your computer", (host) => {
      note(
        host,
        "The device agent makes an outbound HTTPS connection to this server. No router port-forwarding or inbound laptop certificate is required. It runs with your local account permissions; full control adds code execution and file access. Desktop Office requires installed Office and a logged-in Windows session.",
      );
      for (const d of devices) {
        const card = el("article", "", "device-card");
        card.append(
          el("strong", d.name),
          badge(
            d.revoked ? "Revoked" : d.online ? "Online" : "Offline",
            d.online ? "verified" : "",
          ),
          el(
            "p",
            (d.capabilities.platform || "Awaiting agent") +
              " · " +
              (d.capabilities.fullControl
                ? "Full computer control"
                : "Configured actions only") +
              " · " +
              (d.capabilities.actions?.length || 0) +
              " actions",
          ),
        );
        if (!d.revoked)
          card.append(
            button(
              "Use this computer",
              () => form(null, { kind: "bridge" }),
              "quiet-button",
            ),
            button(
              "Revoke access",
              async () => {
                await sendJSON("company/devices/" + d.id + "/revoke", {});
                await deviceManager();
              },
              "text-button",
            ),
          );
        host.append(card);
      }
      const section = el("section", "", "pairing-section");
      section.append(el("h3", "Pair a Windows laptop"));
      const name = field(section, "Computer name", "");
      const result = el("div");
      section.append(
        button(
          "Create pairing token",
          async () => {
            const created = await sendJSON("company/devices", {
              name: name.value,
            });
            result.replaceChildren();
            note(
              result,
              "Copy this token now; it is shown only once. The installer asks for it privately. Revoking the device invalidates it.",
            );
            const token = el("code", created.token, "pairing-token");
            result.append(token);
            const command = el(
              "pre",
              'Invoke-WebRequest -UseBasicParsing "' +
                location.origin +
                '/install-th-device.ps1" -OutFile "$env:TEMP\\install-th-device.ps1"\n& "$env:TEMP\\install-th-device.ps1" -Server "' +
                location.origin +
                '" -FullControl -EnableOdbc -RePair',
            );
            result.append(
              el("h4", "Run in PowerShell on your laptop"),
              command,
            );
            note(
              result,
              "Python 3.10+ must be installed. The installer stores its token under your Windows account, adds a logon startup task and starts the agent. -EnableOdbc installs pyodbc for this Python and discovers DSNs/drivers; their 32/64-bit architectures must match. Omit -FullControl for configured/read-only actions only. It does not install Python, request administrator elevation or access your computer before you run it.",
            );
            const a = el("a", "Download / inspect the installer");
            a.href = "/install-th-device.ps1";
            a.download = "install-th-device.ps1";
            result.append(
              a,
              button(
                "Agent started — refresh devices",
                () => deviceManager(),
                "ink-button",
              ),
            );
          },
          "ink-button",
        ),
        result,
      );
      host.append(
        section,
        button("Refresh devices", () => deviceManager(), "quiet-button"),
        button("Back to connections", () => list(), "text-button"),
      );
      const guide = el("a", "Other systems / HTTPS bridge instructions →");
      guide.href = "/bridge-setup.html";
      guide.target = "_blank";
      guide.rel = "noopener";
      host.append(guide);
    });
  }
  return { list, form, gallery, deviceManager };
}
