import { compare, validatePredicate } from "../site/company-flow.js";
import { deviceInvoke } from "./personal-devices.js";
import { serviceOperation } from "./company-connections.js";
import { gatewayRequest } from "./company-v2-gateway.js";
import { createHash } from "node:crypto";
import { queryWorkbench, readSource } from "./workbench-runtime.js";
import { publicRequest } from "./studio-providers.js";
import { exportRows } from "./company-v2-xlsx.js";
import { submitMedia, inspectMedia } from "./media-runtime.js";
import { confinedFile } from "./th-storage/attachments.mjs";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { outputFiles, fileRoot } from "./studio-files.js";
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export const payloadHash = (step, connection) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          step: {
            tool: step.tool,
            args: step.args,
            connection: step.connection,
          },
          connectionRevision: connection?.revision || 0,
        }),
      ),
    )
    .digest("hex");
export function resolveStepValues(value, steps, depth = 0) {
  if (depth > 12) throw Error("The input mapping is too deeply nested.");
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((item) => resolveStepValues(item, steps, depth + 1));
  if (Object.hasOwn(value, "$step")) {
    const source = steps.find(
      (step) => step.id === value.$step && step.state === "completed",
    );
    if (!source)
      throw Error("The mapped input needs a confirmed upstream result.");
    let output = source.result;
    for (const part of String(value.path || "")
      .split(".")
      .filter(Boolean)) {
      if (
        ["__proto__", "prototype", "constructor"].includes(part) ||
        output == null ||
        !Object.hasOwn(Object(output), part)
      )
        throw Error("The upstream result does not contain the mapped field.");
      output = output[part];
    }
    return structuredClone(output);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw Error("Unsafe input mapping key.");
      return [key, resolveStepValues(item, steps, depth + 1)];
    }),
  );
}
export function resolveToolStep(step, steps) {
  step = { ...step, args: resolveStepValues(step.args, steps) };
  if (step.args.input?.toolFrom) {
    const staged = steps.find(
      (s) => s.id === step.args.input.toolFrom && s.state === "completed",
    );
    if (!staged?.result?.toolId)
      throw Error("The project has not been staged on the server.");
    return {
      ...step,
      args: {
        ...step.args,
        input: { ...step.args.input, toolId: staged.result.toolId },
      },
    };
  }
  if (!step.args.mediaFrom) return step;
  const source = steps.find(
      (s) => s.id === step.args.mediaFrom && s.state === "completed",
    ),
    url = source?.result?.mediaUrls?.[0];
  if (!url)
    throw Error("The visual media is not ready. No publication was sent.");
  return {
    ...step,
    args: {
      ...step.args,
      ...(source.result.mediaType === "text_to_video"
        ? { videoUrl: url }
        : { imageUrl: url }),
    },
  };
}
export function queryRows(result) {
  const rows =
    result?.rows ||
    result?.data ||
    result?.result?.rows ||
    result?.result?.data ||
    result?.result ||
    result;
  if (!Array.isArray(rows))
    throw Error("The query did not return a row collection.");
  return rows;
}
export function createCompanyTools({
  pool,
  getSecret,
  request = publicRequest,
  gateway = gatewayRequest,
  root,
}) {
  const bridgeGateway = (secret, path) =>
    secret.deviceId
      ? (_url, options) =>
          deviceInvoke(
            pool,
            secret.deviceId,
            path.split("/")[2],
            JSON.parse(options.body).input,
            {
              signal: options.signal,
              expectedEffect: [
                "list_folder",
                "inspect_python",
                "export_python",
              ].includes(path.split("/")[2])
                ? "read"
                : secret.effect,
            },
          )
      : gateway(secret.baseUrl, { path });
  return async function execute(step, { connections, steps, signal }) {
    const connection = connections.find((c) => c.id === step.connection),
      secret = connection ? await getSecret("company_" + connection.id) : null,
      args = step.args;
    if (step.tool === "condition") {
      validatePredicate(args);
      return {
        value: compare(args.left, args.op, args.value),
        operator: args.op,
      };
    }
    if (step.tool === "delay") {
      if (
        !Number.isInteger(args.seconds) ||
        args.seconds < 1 ||
        args.seconds > 3600
      )
        throw Error("Delay must be 1–3,600 seconds.");
      if (step.nextAttemptAt && Date.now() >= step.nextAttemptAt)
        return {
          waitedSeconds: args.seconds,
          completedAt: new Date().toISOString(),
        };
      return { deferUntil: Date.now() + args.seconds * 1000 };
    }
    if (step.tool === "join") {
      if (
        !Array.isArray(args.sources) ||
        !args.sources.length ||
        args.sources.length > 24 ||
        !["collect", "concat_rows"].includes(args.mode || "collect")
      )
        throw Error("Choose bounded source steps and a supported join mode.");
      const source = args.sources.map((id) => steps.find((s) => s.id === id));
      if (source.some((s) => !s || !["completed", "skipped"].includes(s.state)))
        throw Error("Wait for all selected branches before joining them.");
      const actual = source.filter((s) => s.state === "completed");
      if (args.mode === "concat_rows") {
        const rows = actual.flatMap((s) => queryRows(s.result));
        if (rows.length > 200)
          throw Error("Join exceeds 200 rows. Aggregate or filter first.");
        return {
          rows,
          rowCount: rows.length,
          sources: actual.map((s) => s.id),
        };
      }
      return {
        results: actual.map((s) => ({ step: s.id, result: s.result })),
        skipped: source.filter((s) => s.state === "skipped").map((s) => s.id),
      };
    }
    if (["service", "message"].includes(step.tool)) {
      const allowed =
        step.tool === "message"
          ? ["messenger", "whatsapp"]
          : ["network", "microsoft", "tiktok"];
      if (!allowed.includes(connection?.kind))
        throw Error("Choose a matching service connection.");
      return serviceOperation(connection, secret, args, {
        request,
        gateway,
        signal,
      });
    }
    if (step.tool === "browse") {
      if (connection?.kind !== "bridge" || !secret?.key)
        throw Error("Connect the computer containing the folder first.");
      const path = "/actions/list_folder/invoke",
        result = await bridgeGateway(secret, path)(
          new URL(path, secret.baseUrl || "https://paired.device"),
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + secret.key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ input: args }),
            signal,
          },
        );
      if (result?.ok !== true || result.output?.readOnly !== true)
        throw Error("The bridge did not confirm a read-only folder listing.");
      return result.output;
    }
    if (step.tool === "inspect_python") {
      if (connection?.kind !== "bridge" || !secret?.key)
        throw Error("Connect the computer containing the tool folder first.");
      const path = "/actions/inspect_python/invoke";
      const response = await bridgeGateway(secret, path)(
        new URL(path, secret.baseUrl || "https://paired.device"),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + secret.key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input: args }),
          signal,
        },
      );
      if (
        response?.ok !== true ||
        response.output?.localExecutionPerformed !== false
      )
        throw Error(
          "The bridge did not confirm a non-executing static inspection.",
        );
      return { ...response.output, sourceConnection: connection.id };
    }
    if (step.tool === "stage_python") {
      if (
        connection?.kind !== "bridge" ||
        connection.execution !== "server" ||
        !connection.verifiedAt
      )
        throw Error(
          "Verify the destination server bridge before staging Python.",
        );
      const inspection = steps.find(
        (s) => s.id === args.from && s.state === "completed",
      )?.result;
      if (inspection?.portability !== "candidate")
        throw Error(
          "Resolve the project portability warnings before transferring it to the server.",
        );
      const source = connections.find(
          (c) => c.id === inspection.sourceConnection,
        ),
        sourceSecret = source && (await getSecret("company_" + source.id));
      if (!sourceSecret?.key)
        throw Error("Reconnect the source computer to package this project.");
      let path = "/actions/export_python/invoke";
      const bundle = await bridgeGateway(sourceSecret, path)(
        new URL(path, sourceSecret.baseUrl || "https://paired.device"),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + sourceSecret.key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: {
              root: inspection.root,
              folder: inspection.folder,
              entrypoint: args.entrypoint || inspection.entrypoint,
            },
          }),
          signal,
        },
      );
      if (
        bundle?.ok !== true ||
        bundle.output?.projectHash !== inspection.projectHash
      )
        throw Error(
          "The project changed since assessment. Inspect it again before transfer.",
        );
      path = "/actions/stage_python/invoke";
      const response = await bridgeGateway(secret, path)(
        new URL(path, secret.baseUrl || "https://paired.device"),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + secret.key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input: bundle.output }),
          signal,
        },
      );
      if (response?.ok !== true || response.output?.staged !== true)
        throw Error("The server did not acknowledge the staged project.");
      return response.output;
    }
    if (step.tool === "bridge") {
      if (connection?.kind !== "bridge" || !secret?.key)
        throw Error("Connect the personal tool bridge securely first.");
      const path =
        "/actions/" + encodeURIComponent(connection.action) + "/invoke";
      let result;
      try {
        result = await bridgeGateway(secret, path)(
          new URL(path, secret.baseUrl || "https://paired.device"),
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + secret.key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ input: args.input || {} }),
            signal,
          },
        );
      } catch (error) {
        if (connection.effect !== "read")
          throw Object.assign(
            Error(
              "The local tool outcome could not be confirmed. Check its actual result before retrying; I will not repeat the action automatically.",
            ),
            { uncertain: true },
          );
        throw error;
      }
      if (result?.ok !== true)
        throw Object.assign(
          Error(
            "The personal tool did not confirm completion. Check its service account, paths and actual result.",
          ),
          { uncertain: connection.effect !== "read" },
        );
      return result.output;
    }
    if (step.tool === "query") {
      if (!connection || !secret)
        throw Error(
          "The database connection is incomplete. Open its secure setup card.",
        );
      return queryWorkbench(
        connection.kind,
        {
          ...args,
          parameters: JSON.stringify(args.parameters || []),
          limit: args.limit || 200,
        },
        secret,
        {
          request:
            connection.kind === "odbc" ? gateway(secret.baseUrl) : request,
          signal,
        },
      );
    }
    if (step.tool === "media") {
      if (connection?.kind !== "media" || !secret?.key)
        throw Error(
          "Configure the visual media service in secure connections.",
        );
      const saveJob = async (id, state) =>
        pool.query(
          "INSERT INTO ai_media_jobs(id,state) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=now()",
          [id, JSON.stringify(state)],
        );
      const mediaSecret = async () => secret;
      let state;
      if (step.result?.jobId) {
        const row = (
          await pool.query("SELECT state FROM ai_media_jobs WHERE id=$1", [
            step.result.jobId,
          ])
        ).rows[0];
        if (!row)
          throw Error(
            "The submitted media job is missing. Check the provider before resubmitting.",
          );
        state = await inspectMedia(row.state, {
          getSecret: mediaSecret,
          request,
          saveJob,
        });
      } else {
        let submitted;
        try {
          submitted = await submitMedia(
            {
              type: connection.mediaType,
              config: {
                model: connection.model,
                prompt: args.prompt,
                extraInput: "{}",
              },
              input: {},
            },
            {
              getSecret: mediaSecret,
              request,
              saveJob,
              allowPaid: true,
              signal,
            },
          );
        } catch (e) {
          if (/uncertain|not acknowledged/i.test(e.message)) e.uncertain = true;
          throw e;
        }
        return { pending: true, jobId: submitted.jobId };
      }
      if (["failed", "canceled"].includes(state.status))
        throw Error(
          "The media provider could not complete this job. The original submission is saved; correct the request before continuing.",
        );
      if (state.status !== "succeeded")
        return { pending: true, jobId: state.id };
      const urls = (
        Array.isArray(state.output) ? state.output : [state.output]
      ).filter((v) => typeof v === "string" && /^https:\/\//.test(v));
      if (!urls.length)
        throw Error(
          "The completed generation has no usable HTTPS media output.",
        );
      return {
        jobId: state.id,
        mediaUrls: urls,
        mediaType: connection.mediaType,
      };
    }
    if (step.tool === "source")
      return readSource(
        "source_http",
        { url: args.url, path: args.path || "" },
        {},
        { request, signal },
      );
    if (step.tool === "asset") {
      const rows = (
        await pool.query(
          "SELECT id,name,type,size FROM files WHERE name ILIKE $1 ORDER BY created_at DESC LIMIT 20",
          ["%" + String(args.query || "").slice(0, 80) + "%"],
        )
      ).rows;
      return {
        files: rows.map((f) => ({ ...f, url: "/api/studio/files/" + f.id })),
      };
    }
    if (step.tool === "export") {
      const prior = steps.find(
        (s) => s.id === args.from && s.state === "completed",
      );
      if (!prior) throw Error("Select a completed query step for export.");
      const format = args.format || "xlsx",
        file = exportRows(queryRows(prior.result), format);
      return outputFiles(
        {
          files: [
            {
              ...file,
              name:
                String(args.name || "results").replace(/\.[^.]+$/, "") +
                "." +
                format,
            },
          ],
        },
        { root },
      );
    }
    if (step.tool === "report")
      return outputFiles(
        {
          files: [
            {
              name: String(args.name || "report.md"),
              type: "text/plain",
              content: String(args.text || ""),
            },
          ],
        },
        { root },
      );
    if (step.tool === "publish") {
      if (
        connection?.kind !== "facebook" ||
        !secret?.key ||
        !/^\d{4,30}$/.test(connection.accountId || "")
      )
        throw Error(
          "Connect an authorized Facebook Page and its Page access token first. Personal-profile password login is not supported.",
        );
      if (
        typeof args.caption !== "string" ||
        !args.caption.trim() ||
        args.caption.length > 10000
      )
        throw Error("A publication needs a nonempty finished caption.");
      let endpoint = "feed",
        payload = { message: args.caption };
      if (args.link) {
        const url = new URL(args.link);
        if (url.protocol !== "https:" || url.username || url.password)
          throw Error("The publication link must be public HTTPS.");
        payload.link = url.href;
      }
      if (args.assetId) {
        if (!/^[a-f0-9-]{36}$/i.test(args.assetId))
          throw Error("Select a saved media asset ID.");
        const file = (
          await pool.query(
            "SELECT id,name,type,size,path FROM files WHERE id=$1",
            [args.assetId],
          )
        ).rows[0];
        if (
          !file ||
          !/^image\/|^video\//.test(file.type) ||
          Number(file.size) > 64 * 1024 * 1024
        )
          throw Error("Select a saved image/video smaller than 64 MB.");
        endpoint = file.type.startsWith("video/") ? "videos" : "photos";
        const boundary = "th-company-" + Date.now();
        const path = await confinedFile(root || fileRoot(), file.path);
        const fields =
          endpoint === "videos"
            ? { description: args.caption, published: "true" }
            : { caption: args.caption, published: "true" };
        const prefix =
          Object.entries(fields)
            .map(
              ([k, v]) =>
                "--" +
                boundary +
                '\r\nContent-Disposition: form-data; name="' +
                k +
                '"\r\n\r\n' +
                v +
                "\r\n",
            )
            .join("") +
          "--" +
          boundary +
          '\r\nContent-Disposition: form-data; name="source"; filename="asset"\r\nContent-Type: ' +
          file.type +
          "\r\n\r\n";
        payload = Readable.from(
          (async function* () {
            yield Buffer.from(prefix);
            for await (const chunk of createReadStream(path)) yield chunk;
            yield Buffer.from("\r\n--" + boundary + "--\r\n");
          })(),
        );
        payload.contentType = "multipart/form-data; boundary=" + boundary;
      }
      if (args.videoUrl) {
        const url = new URL(args.videoUrl);
        if (url.protocol !== "https:" || url.username || url.password)
          throw Error("Use an HTTPS media URL.");
        endpoint = "videos";
        payload = {
          description: args.caption,
          file_url: url.href,
          published: true,
        };
      }
      if (args.imageUrl) {
        const url = new URL(args.imageUrl);
        if (url.protocol !== "https:" || url.username || url.password)
          throw Error("Use an approved HTTPS media URL.");
        endpoint = "photos";
        payload = { caption: args.caption, url: url.href, published: true };
      }
      let data;
      try {
        data = await request(
          "https://graph.facebook.com/v24.0/" +
            connection.accountId +
            "/" +
            endpoint,
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + secret.key,
              "Content-Type": payload.contentType || "application/json",
            },
            body: payload.pipe ? payload : JSON.stringify(payload),
            signal,
          },
        );
      } catch (e) {
        if (/HTTP 4\d\d/.test(e.message))
          throw Error(
            "Facebook rejected this publication. Check Page access, granted permissions and media requirements; the draft is saved.",
          );
        throw Object.assign(
          Error(
            "The publication response could not be confirmed. Check the Page before retrying.",
          ),
          { uncertain: true },
        );
      }
      if (!data?.id && !data?.post_id)
        throw Object.assign(
          Error(
            "Facebook did not return a publication receipt. Check the Page before retrying.",
          ),
          { uncertain: true },
        );
      return {
        receipt: data.post_id || data.id,
        platform: "facebook",
        accountId: connection.accountId,
        url: "https://www.facebook.com/" + (data.post_id || data.id),
      };
    }
    throw Error("This tool is not available.");
  };
}
