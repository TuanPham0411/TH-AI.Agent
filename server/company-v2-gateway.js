import { safePublicMessage } from "../site/company-v2-model.js";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import { publicAddress } from "./studio-providers.js";
const privateAddress = (address) =>
  (net.isIP(address) === 4 &&
    (/^(10\.|192\.168\.)/.test(address) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address))) ||
  (net.isIP(address) === 6 && /^(fc|fd)/i.test(address));
// Owner-configured HTTPS gateway, fixed origin/path. No model-controlled hosts,
// redirects, proxy credentials, loopback or metadata endpoints; TLS is verified.
export function gatewayRequest(
  baseUrl,
  { path = "/query", method: approvedMethod = "POST" } = {},
) {
  const approved = new URL(baseUrl);
  if (approved.protocol !== "https:" || approved.username || approved.password)
    throw Error("Configure an HTTPS gateway.");
  return (url, { method = "POST", headers = {}, body, signal } = {}) =>
    new Promise((resolve, reject) => {
      const target = new URL(url);
      if (
        target.origin !== approved.origin ||
        target.pathname !== path ||
        method !== approvedMethod
      )
        return reject(
          Error("The gateway request is outside the saved connection."),
        );
      const req = https.request(
        target,
        {
          method,
          headers,
          signal,
          timeout: 15000,
          lookup(host, options, cb) {
            dns.lookup(host, { all: true }, (error, rows) => {
              if (error) return cb(error);
              if (
                !rows.length ||
                rows.some(
                  (r) =>
                    !publicAddress(r.address) && !privateAddress(r.address),
                )
              )
                return cb(
                  Error("The gateway resolved to a forbidden address."),
                );
              cb(null, options?.all ? rows : rows[0].address, rows[0].family);
            });
          },
        },
        (res) => {
          let size = 0;
          const chunks = [];
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > 1000000)
              req.destroy(
                Error("Narrow the query: gateway response exceeds 1 MB."),
              );
            else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            if (res.statusCode !== 200) {
              let detail =
                "Check the saved token, approved action, execution environment and connection settings.";
              try {
                const data = JSON.parse(Buffer.concat(chunks).toString());
                if (typeof data.error === "string")
                  detail = safePublicMessage(data.error).slice(0, 500);
              } catch {}
              return reject(
                Error(
                  "The gateway rejected the action (" +
                    res.statusCode +
                    "). " +
                    detail,
                ),
              );
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch {
              reject(
                Error("The gateway did not return a valid read-only result."),
              );
            }
          });
        },
      );
      req.on("error", () =>
        reject(
          Error(
            "The personal gateway is unreachable. Check the saved HTTPS address, network route, certificate and DSN service.",
          ),
        ),
      );
      req.on("timeout", () => req.destroy());
      req.end(body);
    });
}
