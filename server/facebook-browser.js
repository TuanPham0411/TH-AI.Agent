import { deviceInvoke } from "./personal-devices.js";
export async function publishInBrowser(
  pool,
  connection,
  args,
  { signal, invoke = deviceInvoke } = {},
) {
  if (
    typeof args.caption !== "string" ||
    !args.caption.trim() ||
    args.caption.length > 10000
  )
    throw Error("Provide a finished caption under 10,000 characters.");
  if (args.imageUrl || args.videoUrl)
    throw Error(
      "Browser upload needs a saved assetId or localPaths on the paired computer. Save generated media to the library first; a remote media URL is not silently ignored.",
    );
  if (
    args.localPaths !== undefined &&
    (!Array.isArray(args.localPaths) ||
      args.localPaths.length > 4 ||
      args.localPaths.some((p) => typeof p !== "string" || p.length > 2000))
  )
    throw Error("Choose at most four local image/video paths.");
  if (args.assetId && !/^[a-f0-9-]{36}$/i.test(args.assetId))
    throw Error("Choose a saved media asset ID.");
  let caption = args.caption;
  if (args.link) {
    const u = new URL(args.link);
    if (u.protocol !== "https:" || u.username || u.password)
      throw Error("Use an HTTPS post link.");
    caption += "\n" + u.href;
  }
  if (caption.length > 10000)
    throw Error("Caption and link must total under 10,000 characters.");
  signal?.throwIfAborted();
  const reply = await invoke(
    pool,
    connection.deviceId,
    "facebook_publish",
    {
      connectionId: connection.id,
      connectionRevision: connection.revision,
      caption,
      localPaths: args.localPaths || [],
      ...(args.assetId ? { assetId: args.assetId } : {}),
    },
    { signal, expectedEffect: "write" },
  );
  const result = reply?.ok === true ? reply.output : null;
  if (result?.status === "published" && result.confirmed === true) {
    let u;
    try {
      u = new URL(result.url);
    } catch {}
    if (
      u &&
      u.protocol === "https:" &&
      ["www.facebook.com", "facebook.com"].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      (/\/posts\/|\/permalink\//.test(u.pathname) ||
        u.searchParams.has("story_fbid"))
    )
      return {
        receipt: u.href,
        url: u.href,
        platform: "facebook",
        transport: "browser",
        confirmed: true,
        browserClosed: result.browserClosed === true,
      };
  }
  throw Object.assign(
    Error(
      result?.message ||
        "The browser did not confirm a publication permalink. Check Facebook before retrying.",
    ),
    {
      connection: connection.id,
      uncertain:
        result?.status === "uncertain" || result?.status === "published",
    },
  );
}
