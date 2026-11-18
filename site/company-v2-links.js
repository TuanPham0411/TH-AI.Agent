export function safeWorkLink(value, origin) {
  try {
    if (typeof value !== "string" || !value.trim()) return null;
    const url = new URL(value, origin);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
