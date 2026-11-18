import {
  connectionDefinition,
  databaseCredential,
} from "../site/company-connections.js";
import { queryWorkbench } from "./workbench-runtime.js";
import { publicRequest } from "./studio-providers.js";
import { gatewayRequest } from "./company-v2-gateway.js";
export function httpsOrigin(value) {
  let u;
  try {
    u = new URL(value);
  } catch {}
  if (
    !u ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw Error(
      "Use an HTTPS service origin without a path or embedded credentials.",
    );
  return u.origin;
}
export function resourcePath(value) {
  if (
    typeof value !== "string" ||
    !/^\/[a-zA-Z0-9_/.@!$(),:=?&%+~-]*$/.test(value) ||
    value.startsWith("//") ||
    value.includes("..") ||
    value.length > 600
  )
    throw Error("Use a fixed resource path starting with one slash.");
  return value;
}
export function normalizeConnection(kind, body, previous = {}) {
  const definition = connectionDefinition(kind),
    value = { name: body.name?.trim(), kind },
    secret = { ...previous };
  if (!value.name || value.name.length > 100)
    throw Error("Enter a display name under 100 characters.");
  const allowed = new Set([
    "connectionString",
    ...definition.fields.filter((f) => f.private).map((f) => f.key),
    ...(kind === "bridge" ? ["key"] : []),
  ]);
  if (
    !body.secret ||
    typeof body.secret !== "object" ||
    Array.isArray(body.secret) ||
    Object.entries(body.secret).some(
      ([k, v]) => !allowed.has(k) || typeof v !== "string" || v.length > 8000,
    )
  )
    throw Error("Use the supported secure credential fields.");
  for (const [k, v] of Object.entries(body.secret)) if (v.trim()) secret[k] = v;
  for (const f of definition.fields) {
    if (f.private) continue;
    let v =
      body[f.key] ??
      f.default ??
      f.options?.[0]?.[0] ??
      (f.type === "checkbox" ? false : "");
    if (f.type === "checkbox" && typeof v !== "boolean")
      throw Error("Use a boolean permission setting.");
    if (typeof v === "string" && v.length > 3000)
      throw Error("Connection field is too long.");
    if (
      f.required &&
      !(definition.scheme && !body.host && secret.connectionString) &&
      !String(v).trim()
    )
      throw Error("Provide " + f.label + ".");
    if (f.options && !f.options.some(([key]) => key === v))
      throw Error("Choose a supported " + f.label + ".");
    value[f.key] = v;
  }
  if (definition.scheme) {
    // Older URI-only connections remain editable without returning private strings.
    const supplied = !!body.host;
    if (supplied) {
      const settings = {
        ...(previous.driverSettings || {}),
        host: body.host,
        port:
          body.port || definition.fields.find((f) => f.key === "port").default,
        database: body.database,
        username: secret.username,
        password: secret.password || "",
      };
      secret.connectionString = databaseCredential(kind, settings);
      secret.driverSettings = settings;
      value.host = settings.host;
      value.port = String(settings.port);
      value.database = settings.database;
    } else if (!secret.connectionString)
      throw Error(
        "Provide the database host, port, database and read-only account.",
      );
  }
  if (
    ["facebook", "messenger", "whatsapp"].includes(kind) &&
    !/^\d{4,30}$/.test(value.accountId || "")
  )
    throw Error("Use the numeric platform account ID.");
  if (kind === "whatsapp" && !/^\d{4,30}$/.test(value.businessId || ""))
    throw Error("Use the numeric WhatsApp Business account ID.");
  if (kind === "network") {
    value.baseUrl = httpsOrigin(value.baseUrl);
    value.requestPath = resourcePath(value.requestPath);
    value.checkPath = resourcePath(value.checkPath || "/health");
    if (value.auth !== "none" && !secret.key)
      throw Error("Provide the API token or password.");
    if (
      value.auth === "basic" &&
      (!secret.username || /[\r\n:]/.test(secret.username))
    )
      throw Error("Provide a Basic authentication username.");
    value.effect = value.method === "GET" ? "read" : "write";
  }
  if (kind === "microsoft") value.requestPath = resourcePath(value.requestPath);
  if (
    kind === "media" &&
    !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(value.model || "")
  )
    throw Error("Choose a valid media owner/model.");
  if (kind === "odbc") {
    value.baseUrl = httpsOrigin(value.baseUrl);
    secret.baseUrl = value.baseUrl;
  }
  if (kind === "bridge") {
    const {
      action,
      description,
      effect,
      allowWrites = false,
      deviceId,
      transport = "https",
      baseUrl,
    } = body;
    if (
      !/^[a-z][a-z0-9_-]{0,59}$/.test(action || "") ||
      typeof description !== "string" ||
      description.length > 3000 ||
      !["read", "write"].includes(effect) ||
      typeof allowWrites !== "boolean"
    )
      throw Error(
        "Choose an approved action, its inputs and its read/write effect.",
      );
    if (!["https", "device"].includes(transport))
      throw Error("Choose HTTPS or paired device transport.");
    if (transport === "device") {
      if (!/^[a-f0-9-]{36}$/.test(deviceId || ""))
        throw Error("Choose a paired computer.");
      secret.deviceId = deviceId;
      secret.key = "paired-device";
      delete secret.baseUrl;
    } else {
      value.baseUrl = httpsOrigin(baseUrl);
      secret.baseUrl = value.baseUrl;
      delete secret.deviceId;
    }
    Object.assign(value, {
      action,
      description,
      effect,
      allowWrites,
      transport,
      ...(deviceId ? { deviceId } : {}),
      execution: "unverified",
      unattended: false,
    });
    Object.assign(secret, { action, effect, transport });
  }
  if (
    [
      "facebook",
      "messenger",
      "whatsapp",
      "tiktok",
      "microsoft",
      "media",
      "bridge",
      "odbc",
      "firestore",
    ].includes(kind) &&
    !secret.key
  )
    throw Error("Provide the private access token.");
  if (
    kind === "mongo" &&
    !/^mongodb(?:\+srv)?:\/\//.test(secret.connectionString || "")
  )
    throw Error("Use a MongoDB URI including its database.");
  if (
    kind === "firestore" &&
    !/^[a-z][a-z0-9-]{4,62}$/.test(secret.projectId || "")
  )
    throw Error("Provide a Firebase project ID.");
  if (["microsoft", "tiktok"].includes(kind)) value.effect = "read";
  return { value, secret };
}
function headers(c, s) {
  return {
    "Content-Type": "application/json",
    ...(c.auth === "none"
      ? {}
      : c.auth === "basic"
        ? {
            Authorization:
              "Basic " +
              Buffer.from(s.username + ":" + s.key).toString("base64"),
          }
        : { Authorization: "Bearer " + s.key }),
  };
}
export async function serviceOperation(
  c,
  s,
  args,
  {
    request = publicRequest,
    gateway = gatewayRequest,
    signal,
    check = false,
  } = {},
) {
  if (!s) throw Error("Save secure credentials first.");
  const meta = "https://graph.facebook.com/v23.0/";
  let url,
    method = "GET",
    body;
  if (c.kind === "network") {
    const path = check ? c.checkPath : c.requestPath;
    url = new URL(path, c.baseUrl);
    method = check ? "GET" : c.method;
    const call = gateway(c.baseUrl, { path: url.pathname, method });
    try {
      const data = await call(url, {
        method,
        headers: headers(c, s),
        ...(method === "POST"
          ? { body: JSON.stringify(args.input || {}) }
          : {}),
        signal,
      });
      if (data?.ok === false || data?.error)
        throw Error("The endpoint returned an error.");
      return { data, readOnly: method === "GET", confirmed: true };
    } catch (error) {
      throw Object.assign(
        Error(
          "The network service did not confirm the operation. Check its status before retrying a write.",
        ),
        { uncertain: method === "POST" },
      );
    }
  }
  if (c.kind === "microsoft")
    url =
      "https://graph.microsoft.com/v1.0" +
      (check ? "/me?$select=id,displayName" : c.requestPath);
  if (c.kind === "tiktok")
    url =
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name";
  if (["facebook", "messenger", "whatsapp"].includes(c.kind)) {
    url =
      meta +
      c.accountId +
      "?fields=" +
      (c.kind === "whatsapp"
        ? "id,display_phone_number,verified_name"
        : "id,name");
    if (!check && ["messenger", "whatsapp"].includes(c.kind)) {
      if (
        typeof args.recipient !== "string" ||
        !/^\d{4,30}$/.test(args.recipient)
      )
        throw Error(
          "Provide a valid recipient PSID or international phone number.",
        );
      if (c.kind === "messenger") {
        if (
          typeof args.text !== "string" ||
          !args.text.trim() ||
          args.text.length > 1800
        )
          throw Error("Provide a message under 1,800 characters.");
        body = {
          recipient: { id: args.recipient },
          messaging_type: "RESPONSE",
          message: { text: args.text },
        };
        url = meta + c.accountId + "/messages";
      } else {
        body = { messaging_product: "whatsapp", to: args.recipient };
        if (args.template) {
          if (
            !/^[a-z0-9_]{1,512}$/.test(args.template) ||
            !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(args.language || "")
          )
            throw Error("Provide an approved template name and language code.");
          Object.assign(body, {
            type: "template",
            template: {
              name: args.template,
              language: { code: args.language },
            },
          });
        } else {
          if (
            typeof args.text !== "string" ||
            !args.text.trim() ||
            args.text.length > 4096
          )
            throw Error(
              "Provide text under 4,096 characters or an approved template.",
            );
          Object.assign(body, { type: "text", text: { body: args.text } });
        }
        url = meta + c.accountId + "/messages";
      }
      method = "POST";
    }
  }
  if (c.kind === "media") url = "https://api.replicate.com/v1/account";
  if (!url) throw Error("This connection does not support this operation.");
  let result;
  try {
    result = await request(url, {
      method,
      headers: {
        Authorization: "Bearer " + s.key,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
  } catch {
    throw Object.assign(
      Error(
        "The service did not confirm this request. Check its credentials, scopes and account configuration.",
      ),
      { uncertain: method === "POST" },
    );
  }
  if (
    result?.error &&
    (typeof result.error !== "object" ||
      (result.error.code && result.error.code !== "ok"))
  )
    throw Error(
      "The platform rejected this request. Check token permissions, message policy and app approval.",
    );
  if (method === "POST") {
    const id = result.message_id || result.messages?.[0]?.id;
    if (!id)
      throw Object.assign(
        Error(
          "No message receipt returned. Check the platform before retrying.",
        ),
        { uncertain: true },
      );
    return {
      receipt: id,
      platform: c.kind,
      accountId: c.accountId,
      confirmed: true,
    };
  }
  return { data: result, readOnly: true };
}
export async function checkConnection(c, s, options = {}) {
  if (["postgres", "mysql", "sqlserver", "oracle", "odbc"].includes(c.kind)) {
    const query =
      c.kind === "oracle" ? "SELECT 1 AS OK FROM dual" : "SELECT 1 AS ok";
    await queryWorkbench(c.kind, { query, parameters: "[]", limit: 1 }, s, {
      ...options,
      request:
        c.kind === "odbc"
          ? (options.gateway || gatewayRequest)(s.baseUrl)
          : options.request || publicRequest,
    });
    return {
      verified: true,
      note: "Read-only query succeeded. Table-specific permissions still apply.",
    };
  }
  if (c.kind === "mongo") {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(s.connectionString, {
      serverSelectionTimeoutMS: 5000,
    });
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
    } finally {
      await client.close();
    }
    return {
      verified: true,
      note: "MongoDB responds. Collection read permissions must be checked when used.",
    };
  }
  if (c.kind === "firestore") {
    await (options.request || publicRequest)(
      "https://firestore.googleapis.com/v1/projects/" +
        s.projectId +
        "/databases/(default)/documents?pageSize=1",
      { headers: { Authorization: "Bearer " + s.key }, signal: options.signal },
    );
    return { verified: true, note: "Firestore root read succeeded." };
  }
  await serviceOperation(c, s, {}, { ...options, check: true });
  return {
    verified: true,
    note:
      c.kind === "tiktok"
        ? "Creator account read succeeded; publishing is not enabled."
        : "Account / endpoint responded. This check does not send messages, publish or prove every permission.",
  };
}
