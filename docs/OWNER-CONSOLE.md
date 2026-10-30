# Owner Console and member workspaces

## Access

Use **Sign in → Owner · Continue with Google**, with the verified account `eric.scorp93@gmail.com`, then **Your account → Open Owner Console**. Owner authorization is checked by the backend against the existing TH-Server Google session and exact email. Firebase member roles, request bodies and browser state cannot grant owner access.

The console provides configuration, Firestore connection probes, membership approval/blocking, Member/Viewer permissions, plan labels, and a recent configuration audit. Existing owner workflows, credentials, files and Drive recovery records are not moved.

## Firebase setup

1. In Firebase Authentication, enable Google sign-in and authorize `ai.th.io.vn`.
2. In Owner Console, keep registration **Closed** while configuring Firebase.
3. Review the public Web App configuration. The prefilled project is `th-web-d816f`.
4. Upload the service-account JSON privately through the console. Use a dedicated service account with the necessary Firestore document permissions (for example Cloud Datastore User). It does not need Firebase Auth user-management privileges: identities are verified with signed Firebase ID tokens and membership is controlled separately.
5. Save, then **Test saved Firebase configuration**. The test obtains an OAuth token through the fixed Google token endpoint and performs an actual Firestore read. An absent service account or failed IAM/connectivity probe cannot show as connected.
6. Secure `agentStudioUsers` and descendants in Firestore rules. The backend uses service-account IAM; clients must not be able to access this namespace directly. Preserve existing application collections such as `users/`. A broad `match /{document=**} { allow ... }` can override a narrower deny; review all matching rules. The server also probes direct access with each member's Firebase ID token and fails closed unless membership and workflow probes under both the current UID and a separate sentinel UID are denied (HTTP 403). This is a useful guard, not a substitute for reviewing rules across the entire namespace.
7. Choose **Require owner approval** initially. Test with a separate Google account: pending users cannot read or write workflows. Approve the account in Users. Test saving, loading, revision conflict, deleting, read-only role, and blocking before considering open registration.

```text
match /agentStudioUsers/{document=**} {
  allow read, write: if false;
}
```

The repository includes this rule as a **merge snippet**, not a replacement for the project's existing rules. No Firebase rules, existing collections or service accounts are changed automatically.

Firebase Authentication, Firestore reads/writes, storage and managed backups may incur provider charges according to the Google project plan and usage. Studio plan labels do not collect or cover those charges.

The Web API key is public configuration, not administrative authorization. Restrict it to the required Firebase APIs/referrers using Google's supported settings. Never place a service-account private key in browser code, repository files, chat, or a block configuration.

## Data and identity boundaries

Registration controls apply to Studio membership, not global Firebase Authentication account creation. Google sign-in can create an identity record in the shared Firebase project before Studio rejects a closed registration. This console does not delete or modify identities used by other applications. Its user list is the Studio membership namespace, not every Firebase Auth account.

- Owner: existing PostgreSQL tables and Drive-first storage through TH-Server. Configuration/private key are server-only entries in the existing protected credential store, with durable transaction acknowledgement. They are never returned through configuration or credential-status APIs. Protect database/Drive/operator access and rotate keys when appropriate.
- Members: `agentStudioUsers/{verifiedFirebaseUid}` and `.../workflows/{workflowUuid}` in Firestore. Each document stores JSON in its `payload` field. The verified token UID determines paths; submitted UID/role/plan values do not.
- Google-only Firebase identities must pass RS256 signature, issuer, audience, expiration and verified-email checks. A Google account lookup checks current account availability. Membership status is read again on every request, so blocking takes effect on the next request. Browser member authentication uses in-memory Firebase SDK persistence; sign in again after a reload.
- Workflow updates use both application revision and Firestore update-time preconditions. Deletes also use a Firestore update-time precondition. Missing acknowledgement is treated as an error; the browser does not claim a successful save.
- Configuration updates have optimistic revision checks and an atomic owner audit entry. The latest 200 configuration events are kept. Member status/role changes currently have document update timestamps, not a full immutable security audit trail.
- Member API endpoints do not expose owner tables, secrets, execution, media, timers, add-ins, or owner administration. Viewer is read-only. Member can save/delete their own workflow drafts and run local previews.
- Firebase backups, retention and recovery are separate from the existing owner Drive backup. Configure Firestore managed backups/export according to the project's requirements before storing production member data. This release does not promise automatic Drive backups of Firebase member records.

## Operational limitations

Plan labels (`free`, `pro`, `business`) are metadata only. There is no payment collection, subscription enforcement or billable member execution. Member workflow lists are paginated at 100 records; the editor provides a Next page control. Graph payloads are capped at 200,000 UTF-8 bytes. Durable user quotas, per-user workers, shared projects and credential delegation must be implemented before public automation execution.

`publicStudio` controls whether the anonymous design workspace is displayed. All private APIs enforce identity independently; hiding the public editor is not an access-control boundary for static assets. Public registration defaults to Closed and cannot be enabled until the saved Firebase configuration passes a probe. If credentials/project change, close registration, save replacement credentials, probe, then reopen.

Owner Google sign-in continues working if member Firebase is unavailable. Member configuration does not replace the owner OAuth client, system PostgreSQL connection, TH-Server storage broker or Drive identity.
