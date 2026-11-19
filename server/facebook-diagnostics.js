// Do not expose Graph response messages, request URLs, tokens or arbitrary fields.
export function facebookRejection(data, status) {
  const raw = data?.error || {},
    code = Number.isSafeInteger(raw.code) ? raw.code : null,
    subcode = Number.isSafeInteger(raw.error_subcode)
      ? raw.error_subcode
      : null;
  let guidance =
    "Check that this connection uses a Facebook Page ID and a Page access token, not a personal-profile login. Confirm the Page grants permission to publish.";
  if (code === 190)
    guidance =
      "The access token is invalid, expired or revoked. Replace it with a valid Page access token, then test the connection.";
  else if ([10, 200, 294].includes(code))
    guidance =
      "Check pages_manage_posts and pages_read_engagement permissions, app access/review, and the account’s permission to create content on this Page. Reading the Page name does not verify permission to publish.";
  else if ([100, 803].includes(code))
    guidance =
      "Check the Page ID, Page access token and the post/media parameters. The supplied destination or parameters were not accepted.";
  else if ([4, 17, 32, 613].includes(code))
    guidance =
      "Facebook reported a usage limit. Wait and review the app/Page limits before submitting again.";
  else if (code === 368)
    guidance =
      "Facebook has restricted this action. Check Page/account restrictions and the app status in Meta before submitting again.";
  const diagnostic = {
    platform: "facebook",
    httpStatus: status,
    code,
    subcode,
    guidance,
  };
  return Object.assign(
    Error(
      "Facebook rejected the publication (" +
        [
          "HTTP " + status,
          code !== null ? "code " + code : null,
          subcode !== null ? "subcode " + subcode : null,
        ]
          .filter(Boolean)
          .join("; ") +
        "). " +
        guidance +
        " The draft is saved; no publication receipt was returned.",
    ),
    { facebookDiagnostic: diagnostic },
  );
}
