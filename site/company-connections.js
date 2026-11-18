// Shared, typed connection contracts. Passwords and driver strings are vault-only.
const f = (key, label, extra = {}) => ({ key, label, ...extra });
const db = (title, port, scheme) => ({
  title,
  group: "Databases",
  icon: "DB",
  summary: "Parameterized, read-only queries and real spreadsheet exports.",
  auth: "Use a dedicated read-only database account. The server must have a network route to this host.",
  fields: [
    f("host", "Database host", { required: true }),
    f("port", "Port", { type: "number", default: String(port) }),
    f("database", "Database / service name", { required: true }),
    f("username", "Database user", { private: true, required: true }),
    f("password", "Database password", { private: true, secret: true }),
  ],
  scheme,
});
export const connectionTypes = {
  postgres: db("PostgreSQL", 5432, "postgresql"),
  mysql: db("MySQL", 3306, "mysqls"),
  sqlserver: db("Microsoft SQL Server", 1433, "sqlserver"),
  oracle: db("Oracle", 1521, "oracle"),
  mongo: {
    title: "MongoDB",
    group: "Databases",
    icon: "DB",
    summary: "Read collections using bounded filters.",
    auth: "A read-only MongoDB user and URI. Include the database in the URI.",
    fields: [
      f("connectionString", "MongoDB connection URI", {
        private: true,
        secret: true,
        required: true,
        placeholder: "mongodb+srv://user:password@cluster/database",
      }),
    ],
  },
  firestore: {
    title: "Firebase / Firestore",
    group: "Databases",
    icon: "DB",
    summary: "Read a specific project with structured queries.",
    auth: "Google OAuth token with datastore scope and IAM read access. An API key alone cannot authorize private data. Tokens expire and must be renewed.",
    fields: [
      f("projectId", "Firebase project ID", { private: true, required: true }),
      f("key", "Google OAuth access token", {
        private: true,
        secret: true,
        required: true,
      }),
    ],
  },
  odbc: {
    title: "ODBC / DSN gateway",
    group: "Databases",
    icon: "DB",
    summary: "Read an existing DSN through its HTTPS gateway.",
    auth: "The gateway machine owns the ODBC driver, DSN and database login. The web server sends parameterized read-only requests to /query; it cannot use your laptop DSN directly.",
    fields: [
      f("baseUrl", "HTTPS gateway URL", { type: "url", required: true }),
      f("dsn", "DSN reference", { placeholder: "odssg_vn" }),
      f("key", "Private access token", {
        private: true,
        secret: true,
        required: true,
      }),
    ],
  },
  network: {
    title: "Network / internal API",
    group: "Network & services",
    icon: "NET",
    summary: "Call a fixed HTTPS endpoint on your LAN, VPN or internet.",
    auth: "A reachable HTTPS service with trusted TLS. This is an HTTP API connector, not a VPN or arbitrary TCP tunnel. Files/SMB and Windows shares use the laptop bridge.",
    fields: [
      f("baseUrl", "HTTPS service origin", {
        required: true,
        type: "url",
        placeholder: "https://service.example.com",
      }),
      f("requestPath", "Operation path", {
        required: true,
        default: "/status",
      }),
      f("checkPath", "Health check path", { default: "/health" }),
      f("method", "HTTP method", {
        options: [
          ["GET", "GET · read"],
          ["POST", "POST · write"],
        ],
      }),
      f("auth", "Authentication", {
        options: [
          ["none", "No authentication"],
          ["bearer", "Bearer token"],
          ["basic", "HTTP Basic"],
        ],
      }),
      f("username", "API username", { private: true }),
      f("key", "API token / password", { private: true, secret: true }),
      f("description", "Operation inputs and purpose", { rows: 3 }),
      f(
        "allowWrites",
        "Allow this fixed operation without approval each time",
        { type: "checkbox" },
      ),
    ],
  },
  facebook: {
    title: "Facebook Page",
    group: "Social & messaging",
    icon: "FB",
    summary: "Publish text, links, images and videos to your Page.",
    auth: "Requires a Page access token, Page ID, pages_manage_posts and required Meta app/Page permissions. Personal-profile passwords are not supported.",
    docs: "https://developers.facebook.com/docs/pages-api/",
    fields: [
      f("accountId", "Facebook Page ID", { required: true }),
      f("key", "Private access token", {
        private: true,
        secret: true,
        required: true,
      }),
      f(
        "allowPublish",
        "Allow this assistant to publish to this Page without asking each time",
        { type: "checkbox" },
      ),
    ],
  },
  messenger: {
    title: "Messenger",
    group: "Social & messaging",
    icon: "MSG",
    summary: "Send a message to an eligible Page-scoped recipient.",
    auth: "Requires a Page token, pages_messaging, app review and a recipient PSID. Meta messaging windows and user consent apply. Page publishing credentials alone do not prove messaging permission.",
    docs: "https://developers.facebook.com/docs/messenger-platform/",
    fields: [
      f("accountId", "Messenger Page ID", { required: true }),
      f("key", "Page access token", {
        private: true,
        secret: true,
        required: true,
      }),
      f("allowWrites", "Allow messages without approval each time", {
        type: "checkbox",
      }),
    ],
  },
  whatsapp: {
    title: "WhatsApp Business",
    group: "Social & messaging",
    icon: "WA",
    summary: "Send Cloud API text or approved template messages.",
    auth: "Requires a Business phone-number ID and system-user token with whatsapp_business_messaging. Free-form text uses the active customer-service window; outside it use an approved template and opt-in.",
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api/",
    fields: [
      f("accountId", "Phone-number ID", { required: true }),
      f("businessId", "WhatsApp Business account ID", { required: true }),
      f("key", "System-user access token", {
        private: true,
        secret: true,
        required: true,
      }),
      f("allowWrites", "Allow messages without approval each time", {
        type: "checkbox",
      }),
    ],
  },
  tiktok: {
    title: "TikTok account",
    group: "Social & messaging",
    icon: "TT",
    summary: "Verify the creator account and retrieve account information.",
    auth: "User OAuth access token with user.info.basic. This connector reads account information only. Direct Post additionally needs video.publish, reviewed app access, a verified media domain and a dedicated publishing flow; it is not enabled by saving this token.",
    docs: "https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/",
    fields: [
      f("key", "TikTok user access token", {
        private: true,
        secret: true,
        required: true,
      }),
    ],
  },
  microsoft: {
    title: "Microsoft 365 / Office cloud",
    group: "Office & personal tools",
    icon: "365",
    summary:
      "Read a fixed Microsoft Graph resource: OneDrive, Excel or user data.",
    auth: "Microsoft Graph delegated access token with permissions for the selected resource (for example Files.Read for OneDrive). This does not control desktop Office. Expired tokens require renewal.",
    docs: "https://learn.microsoft.com/graph/overview",
    fields: [
      f("requestPath", "Microsoft Graph resource path", {
        default: "/me/drive/root/children",
        required: true,
      }),
      f("key", "Microsoft Graph access token", {
        private: true,
        secret: true,
        required: true,
      }),
      f("description", "Resource purpose / expected output", { rows: 3 }),
    ],
  },
  bridge: {
    title: "Laptop / Office / custom tool",
    group: "Office & personal tools",
    icon: "PC",
    summary:
      "Use your computer account to run Office, Python, PowerShell, CMD and approved tools.",
    auth: "Pair the outbound device agent or use an existing HTTPS bridge. Desktop tools require an online computer and cannot become independent server automation.",
    fields: [],
  },
  media: {
    title: "Image / video generation",
    group: "Media services",
    icon: "ART",
    summary: "Generate real media through Replicate.",
    auth: "Replicate API token and exact owner/model. Generation has provider charges; a completed output is required before publication.",
    fields: [
      f("model", "Media service model (owner/model)", { required: true }),
      f("mediaType", "Visual output", {
        options: [
          ["text_to_image", "Image"],
          ["text_to_video", "Short video"],
        ],
      }),
      f("key", "Private access token", {
        private: true,
        secret: true,
        required: true,
      }),
      f(
        "allowMedia",
        "Allow generation charges for this connection without asking each time",
        { type: "checkbox" },
      ),
    ],
  },
};
export const connectionGroups = [
  ...new Set(Object.values(connectionTypes).map((x) => x.group)),
];
export function connectionDefinition(kind) {
  const d = connectionTypes[kind];
  if (!d) throw Error("Choose a supported connection type.");
  return d;
}
export function databaseCredential(kind, fields, previous = {}) {
  const d = connectionDefinition(kind);
  if (!d.scheme) return null;
  const s = {
    ...previous,
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "")),
  };
  if (!s.host || !s.database || !s.username)
    throw Error("Provide the host, database/service and read-only user.");
  if (
    /[\s/?#@]/.test(s.host) ||
    !Number.isInteger(Number(s.port)) ||
    Number(s.port) < 1 ||
    Number(s.port) > 65535
  )
    throw Error("Use a hostname or IP and valid TCP port.");
  if (kind === "sqlserver")
    return JSON.stringify({
      server: s.host,
      port: Number(s.port),
      database: s.database,
      user: s.username,
      password: s.password || "",
      options: { encrypt: true, trustServerCertificate: false },
    });
  if (kind === "oracle")
    return JSON.stringify({
      user: s.username,
      password: s.password || "",
      connectString: `${s.host}:${s.port}/${s.database}`,
    });
  const host = s.host.includes(":") ? `[${s.host}]` : s.host;
  return `${d.scheme}://${encodeURIComponent(s.username)}:${encodeURIComponent(s.password || "")}@${host}:${s.port}/${encodeURIComponent(s.database)}`;
}
