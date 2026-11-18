const step = (tool, title, connection, args = {}, extra = {}) => ({
  tool,
  title,
  skill: ["query", "export", "condition", "join", "delay"].includes(tool)
    ? "data"
    : tool === "publish" || tool === "message"
      ? "publisher"
      : "research",
  connection: connection || null,
  args,
  ...extra,
});
const slot = (key, kind, name, action) => ({
  key,
  kind,
  name,
  ...(action ? { action } : {}),
});
const examples = [];
function add(key, title, category, description, slots, procedure, needs = []) {
  examples.push({
    id:
      "00000000-0000-4000-8000-" +
      String(examples.length + 1).padStart(12, "0"),
    source: "starter-template",
    draft: true,
    templateKey: key,
    title,
    category,
    description,
    slots,
    procedure: procedure.map((s, i) => ({
      ...s,
      connectionSlot: s.connection || null,
      id: "step-" + (i + 1),
      state: "pending",
      dependsOn: s.dependsOn ?? (i ? ["step-" + i] : []),
    })),
    needs,
    instructions:
      description +
      " Before executing, ask me to configure missing connections and replace every YOUR_ placeholder. Do not invent credentials, table names, files, paths, media or results. Do not enable automation until a successful run.",
  });
}
for (const [kind, label, query, parameters, collection] of [
  [
    "odbc",
    "ODBC / DSN",
    "SELECT * FROM YOUR_TABLE WHERE YOUR_CODE_COLUMN LIKE ?",
    ["%10-ADU8%"],
  ],
  [
    "postgres",
    "PostgreSQL",
    "SELECT * FROM YOUR_TABLE WHERE YOUR_CODE_COLUMN LIKE $1",
    ["%10-ADU8%"],
  ],
  [
    "mysql",
    "MySQL",
    "SELECT * FROM YOUR_TABLE WHERE YOUR_CODE_COLUMN LIKE ?",
    ["%10-ADU8%"],
  ],
  [
    "sqlserver",
    "SQL Server",
    "SELECT TOP 100 * FROM YOUR_TABLE WHERE YOUR_CODE_COLUMN LIKE @p1",
    ["%10-ADU8%"],
  ],
  [
    "oracle",
    "Oracle",
    "SELECT * FROM YOUR_TABLE WHERE YOUR_CODE_COLUMN LIKE :1",
    ["%10-ADU8%"],
  ],
  ["mongo", "MongoDB", "{}", [], "YOUR_COLLECTION"],
  ["firestore", "Firestore", "{}", [], "YOUR_COLLECTION"],
])
  add(
    "query-" + kind,
    label + " → Excel",
    "Data & reports",
    "Read actual matching records and create an Excel file from the returned rows.",
    [slot("data_source", kind, label)],
    [
      step("query", "Read matching records", "data_source", {
        query,
        parameters,
        limit: 100,
        ...(collection ? { collection } : {}),
      }),
      step("export", "Export returned rows", null, {
        from: "step-1",
        format: "xlsx",
        name: "matching-records.xlsx",
      }),
    ],
    ["Read-only account", "Actual schema/collection", "Filter values"],
  );
for (const format of ["csv", "json"])
  add(
    "export-" + format,
    "Query → " + format.toUpperCase(),
    "Data & reports",
    "Query the configured database and export its actual results.",
    [slot("data_source", "postgres", "Source database")],
    [
      step("query", "Read actual rows", "data_source", {
        query: "SELECT * FROM YOUR_TABLE",
        parameters: [],
        limit: 100,
      }),
      step("export", "Create " + format.toUpperCase(), null, {
        from: "step-1",
        format,
        name: "query-results." + format,
      }),
    ],
    ["Actual table/schema"],
  );
add(
  "source",
  "Read a source → factual report",
  "Research",
  "Retrieve a public HTTPS JSON/text source; inspect its actual returned evidence.",
  [],
  [
    step("source", "Read public source", null, {
      url: "https://www.python.org/",
    }),
    step("report", "Summarize confirmed source", null, {
      from: "step-1",
      instruction:
        "Summarize the actual retrieved source. State any evidence limitations.",
      name: "source-report.md",
    }),
  ],
);
add(
  "report",
  "Create a report file",
  "Data & reports",
  "Create a Markdown report from content you supply. Replace the sample text before use.",
  [],
  [
    step("report", "Write report", null, {
      name: "report.md",
      text: "# YOUR_REPORT_TITLE\n\nYOUR_REPORT_CONTENT",
    }),
  ],
  ["Report content"],
);
add(
  "asset",
  "Find saved media",
  "Content & social",
  "Find a real saved image/video by name before using it in another workflow.",
  [],
  [step("asset", "Find saved media", null, { query: "YOUR_MEDIA_NAME" })],
  ["Existing media name"],
);
add(
  "media",
  "Generate an image or short video",
  "Content & social",
  "Generate media through a configured provider and wait for its actual output.",
  [slot("visuals", "media", "Image/video provider")],
  [
    step("media", "Generate requested visual", "visuals", {
      prompt: "YOUR_FINISHED_VISUAL_PROMPT",
    }),
  ],
  ["Model/output type", "Provider billing", "Visual prompt"],
);
add(
  "facebook",
  "Publish a Facebook Page post",
  "Content & social",
  "Publish your finished text/link to an authorized Facebook Page after exact-payload approval.",
  [slot("page", "facebook", "Facebook Page")],
  [
    step("publish", "Publish finished post", "page", {
      caption: "YOUR_FINISHED_CAPTION",
      link: "https://YOUR_PUBLIC_LINK",
    }),
  ],
  ["Page ID/token/permissions", "Caption and optional link"],
);
add(
  "media-facebook",
  "Create media → publish to Facebook",
  "Content & social",
  "Create a real visual first, then publish it with finished original content. Never post an invented media URL.",
  [
    slot("visuals", "media", "Image/video provider"),
    slot("page", "facebook", "Facebook Page"),
  ],
  [
    step("media", "Generate visual", "visuals", {
      prompt: "YOUR_FINISHED_VISUAL_PROMPT",
    }),
    step("publish", "Publish confirmed media", "page", {
      caption: "YOUR_FINISHED_CAPTION",
      mediaFrom: "step-1",
    }),
  ],
  ["Media billing/model", "Page permissions", "Content brief"],
);
for (const kind of ["messenger", "whatsapp"])
  add(
    "message-" + kind,
    "Send a " +
      (kind === "whatsapp" ? "WhatsApp Business" : "Messenger") +
      " message",
    "Content & social",
    "Send an eligible, consented message and retain the actual platform receipt.",
    [slot("messages", kind, "Messaging account")],
    [
      step("message", "Send approved message", "messages", {
        recipient: "YOUR_RECIPIENT_ID",
        text: "YOUR_FINISHED_MESSAGE",
      }),
    ],
    [
      "Recipient PSID/phone",
      "Platform messaging window/consent",
      "For WhatsApp outside the window: approved template and language",
    ],
  );
add(
  "tiktok",
  "Read TikTok creator information",
  "Content & social",
  "Read the connected creator profile. This sample does not publish videos.",
  [slot("creator", "tiktok", "TikTok creator")],
  [step("service", "Read creator information", "creator", {})],
  ["User access token with user.info.basic"],
);
for (const method of ["GET", "POST"])
  add(
    "network-" + method.toLowerCase(),
    method + " · intranet / network API",
    "Network & services",
    "Invoke the endpoint/method saved in your network connection. POST is an external write and needs approval.",
    [slot("api", "network", "Internal API")],
    [
      step("service", "Call configured " + method + " endpoint", "api", {
        input: method === "POST" ? { request: "YOUR_REQUEST_DATA" } : {},
      }),
    ],
    [
      "Trusted HTTPS origin",
      "Saved " + method + " operation path",
      "Network route/authentication",
    ],
  );
add(
  "office-cloud",
  "Microsoft 365 / OneDrive / Excel cloud",
  "Office & laptop",
  "Read the exact Microsoft Graph resource configured in this connection.",
  [slot("office_cloud", "microsoft", "Microsoft Graph")],
  [step("service", "Read Office cloud resource", "office_cloud", {})],
  ["Graph resource path", "OAuth token and resource scopes"],
);
for (const [action, title, input] of [
  [
    "office",
    "Desktop Excel / Word",
    {
      app: "excel",
      operation: "read",
      path: "C:\\YOUR_FOLDER\\workbook.xlsx",
      sheet: "Sheet1",
      range: "A1:C10",
    },
  ],
  [
    "execute",
    "Python on your computer",
    {
      runtime: "python",
      cwd: "C:\\YOUR_FOLDER",
      code: 'import json,sys\nvalue=json.load(sys.stdin)\nprint(json.dumps({"answer":value["a"]+value["b"]}))',
      input: { a: 2, b: 3 },
    },
  ],
  [
    "execute",
    "PowerShell on your computer",
    {
      runtime: "powershell",
      cwd: "C:\\YOUR_FOLDER",
      code: '@{ date=(Get-Date).ToString("o"); computer=$env:COMPUTERNAME } | ConvertTo-Json -Compress',
    },
  ],
  [
    "execute",
    "CMD on your computer",
    { runtime: "cmd", cwd: "C:\\YOUR_FOLDER", code: "@echo off\nver" },
  ],
  [
    "read_file",
    "Read a local text file",
    { path: "C:\\YOUR_FOLDER\\document.txt" },
  ],
  [
    "write_file",
    "Write a local text file",
    {
      path: "C:\\YOUR_FOLDER\\report.txt",
      text: "YOUR_REPORT_CONTENT",
      overwrite: false,
    },
  ],
  [
    "YOUR_APPROVED_ACTION",
    "Custom executable / local tool",
    { request: "YOUR_TOOL_INPUT" },
  ],
  [
    "YOUR_APPROVED_ACTION",
    "Local network share / hardware",
    { request: "YOUR_DEVICE_OR_SHARE_INPUT" },
  ],
  [
    "YOUR_APPROVED_ACTION",
    "Google service / owner-developed wrapper",
    { request: "YOUR_GOOGLE_WRAPPER_INPUT" },
  ],
])
  add(
    "local-" + examples.length,
    title,
    "Office & laptop",
    "Invoke the specific action enabled on your paired computer. It must be online; local files/results stay local unless a separate transfer is provided.",
    [slot("computer", "bridge", title, action)],
    [step("bridge", title, "computer", { input })],
    [
      "Paired online computer",
      "Exact action and input contract",
      "Installed tools/account permissions",
    ],
  );
add(
  "folder",
  "Browse a folder without execution",
  "Office & laptop",
  "List files in an approved root without running the project.",
  [slot("computer", "bridge", "Source computer", "list_folder")],
  [
    step("browse", "List folder", "computer", {
      root: "home",
      folder: "YOUR_RELATIVE_FOLDER",
    }),
  ],
  ["Approved root/folder"],
);
add(
  "inspect-python",
  "Assess Python portability",
  "Office & laptop",
  "Inspect Python source without importing or running it locally, and report portability/dependency findings.",
  [slot("computer", "bridge", "Source computer", "inspect_python")],
  [
    step("inspect_python", "Assess source without execution", "computer", {
      root: "home",
      folder: "YOUR_RELATIVE_PROJECT",
    }),
  ],
  ["Python project path"],
);
add(
  "migrate-python",
  "Inspect → stage → test Python on server",
  "Office & laptop",
  "Assess source without local execution; transfer only an eligible project to a verified server and run its pinned version in isolation.",
  [
    slot("computer", "bridge", "Source computer", "inspect_python"),
    slot("server_stage", "bridge", "Server staging", "stage_python"),
    slot("server_run", "bridge", "Server runtime", "run_python_tool"),
  ],
  [
    step("inspect_python", "Assess Python source", "computer", {
      root: "home",
      folder: "YOUR_RELATIVE_PROJECT",
    }),
    step("stage_python", "Transfer eligible source", "server_stage", {
      from: "step-1",
      entrypoint: "main.py",
    }),
    step("bridge", "Run isolated server test", "server_run", {
      input: { toolFrom: "step-2", input: {} },
    }),
  ],
  [
    "Source folder",
    "Verified server bridge",
    "Compatible prepared Python image",
  ],
);
add(
  "conditional-data",
  "Query → condition → export or empty result",
  "Operations & logic",
  "Query once, evaluate whether rows exist, enter exactly one conditional branch and join the outcomes.",
  [slot("data_source", "postgres", "Source database")],
  [
    step("query", "Query source data", "data_source", {
      query: "SELECT * FROM YOUR_TABLE",
      parameters: [],
      limit: 100,
    }),
    step("condition", "Any matching rows?", null, {
      left: { $step: "step-1", path: "rowCount" },
      op: "gt",
      value: 0,
    }),
    step(
      "export",
      "Export matching rows",
      null,
      { from: "step-1", format: "xlsx", name: "matching.xlsx" },
      {
        dependsOn: ["step-2"],
        when: { step: "step-2", path: "value", op: "eq", value: true },
        operation: "Rows found",
      },
    ),
    step(
      "report",
      "Explain empty result",
      null,
      { name: "no-results.md", text: "The query returned no matching rows." },
      {
        dependsOn: ["step-2"],
        when: { step: "step-2", path: "value", op: "eq", value: false },
        operation: "No matching rows",
      },
    ),
    step(
      "join",
      "Join selected branch",
      null,
      { sources: ["step-3", "step-4"], mode: "collect" },
      { dependsOn: ["step-3", "step-4"] },
    ),
  ],
  ["Actual source table and filters"],
);
add(
  "parallel-data",
  "Parallel databases → join → Excel",
  "Operations & logic",
  "Read two independent configured sources concurrently, wait for both, concatenate actual row collections and export the result.",
  [
    slot("first", "postgres", "First source"),
    slot("second", "mysql", "Second source"),
  ],
  [
    step(
      "query",
      "Read source A",
      "first",
      { query: "SELECT * FROM YOUR_TABLE_A", parameters: [], limit: 80 },
      { dependsOn: [], operation: "Source A" },
    ),
    step(
      "query",
      "Read source B",
      "second",
      { query: "SELECT * FROM YOUR_TABLE_B", parameters: [], limit: 80 },
      { dependsOn: [], operation: "Source B" },
    ),
    step(
      "join",
      "Merge actual rows",
      null,
      { sources: ["step-1", "step-2"], mode: "concat_rows" },
      { dependsOn: ["step-1", "step-2"], operation: "Consolidation" },
    ),
    step("export", "Export consolidated data", null, {
      from: "step-3",
      format: "xlsx",
      name: "consolidated.xlsx",
    }),
  ],
  ["Two read-only connections", "Actual source schemas/compatible fields"],
);
add(
  "delay",
  "Run → persistent delay → next operation",
  "Operations & logic",
  "Read an endpoint, checkpoint a delay without holding a worker, then read it again.",
  [slot("api", "network", "Read-only network endpoint")],
  [
    step("service", "Read current service state", "api", {}),
    step("delay", "Wait 30 seconds", null, { seconds: 30 }),
    step("service", "Read service state again", "api", {}),
  ],
  ["Read-only GET endpoint", "Delay duration"],
);
add(
  "parallel-publish",
  "Parallel media and research → publish → notify",
  "Operations & logic",
  "Generate real media and read a source in parallel; after both finish, publish finished content, wait, then notify via WhatsApp. This is a configurable draft, not a running campaign.",
  [
    slot("visuals", "media", "Media service"),
    slot("page", "facebook", "Facebook Page"),
    slot("messages", "whatsapp", "WhatsApp Business"),
  ],
  [
    step(
      "media",
      "Create campaign visual",
      "visuals",
      { prompt: "YOUR_FINISHED_VISUAL_PROMPT" },
      { dependsOn: [], operation: "Production" },
    ),
    step(
      "source",
      "Retrieve campaign source",
      null,
      { url: "https://YOUR_PUBLIC_SOURCE" },
      { dependsOn: [], operation: "Research" },
    ),
    step(
      "publish",
      "Publish approved campaign",
      "page",
      { caption: "YOUR_VERIFIED_FINISHED_CONTENT", mediaFrom: "step-1" },
      { dependsOn: ["step-1", "step-2"], operation: "Publishing" },
    ),
    step("delay", "Wait before notification", null, { seconds: 10 }),
    step(
      "message",
      "Notify recipient",
      "messages",
      { recipient: "YOUR_RECIPIENT_PHONE", text: "YOUR_FINISHED_NOTIFICATION" },
      { operation: "Reporting" },
    ),
  ],
  [
    "Verified content/source",
    "Billing and Page permissions",
    "Eligible WhatsApp recipient/message",
  ],
);
export const workflowExamples = examples;
