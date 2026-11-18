// The legacy studio stays available only for controlled migration/recovery.
if (new URLSearchParams(location.search).get("legacy") === "1")
  import("./app.js");
else import("./company-v2-app.js");
