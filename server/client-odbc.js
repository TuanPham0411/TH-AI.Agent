import { readQuery } from "./workbench-runtime.js";
import { deviceInvoke } from "./personal-devices.js";
export async function clientOdbcQuery(pool, connection, args, { signal } = {}) {
  const query = readQuery(args.query),
    parameters = args.parameters || [],
    limit = args.limit ?? 100;
  if (
    !Array.isArray(parameters) ||
    parameters.length > 50 ||
    parameters.some(
      (v) => v !== null && !["string", "number", "boolean"].includes(typeof v),
    ) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200
  )
    throw Error("Use 1–200 rows and bounded scalar parameters.");
  const reply = await deviceInvoke(
    pool,
    connection.deviceId,
    "odbc_query",
    {
      connectionId: connection.id,
      connectionRevision: connection.revision,
      query,
      parameters,
      limit,
    },
    { signal, expectedEffect: "read" },
  );
  const result = reply?.output;
  if (
    reply?.ok !== true ||
    result?.readOnly !== true ||
    !Array.isArray(result.rows) ||
    result.rows.length > limit ||
    JSON.stringify(result).length > 180000
  )
    throw Error("The computer did not return a bounded read-only ODBC result.");
  return result;
}
