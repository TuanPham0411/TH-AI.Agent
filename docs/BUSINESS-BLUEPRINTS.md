# Business Blueprint Library

## What is included

The English Studio now provides 13 editable blueprints in four operating groups. They are actual connected graphs with validation, settings, guides and runtime implementations. Creating a blueprint does **not** enable its schedule, authorize spend or publish content. Complete the launch checklist, Check/save, test with the intended account and review Auto's per-node permissions, quotas and paid/media/write controls.

| Group | Blueprints |
| --- | --- |
| Content engine | Trend → Picture → Channels; Trend → Video → Channels; Campaign Delivery |
| Market intelligence | WooCommerce; Shopify; Shopee; TikTok Shop product watches |
| Sales operations | Sales Distribution Planner; Confirm Paid Orders; Customer Care Assistant |
| Brand operations | Community Reply Desk; Autonomous Website Editor; Advertising Creative Desk |

## Content every five hours

Use one producer and its companion delivery workflow, with the same campaign ID. The producer's Auto Input interval is **300 minutes**. It claims the time window, runs the configured web search before the research agent for dated source URLs, validates evidence, creates a structured creative brief and submits a paid media job. Captions/titles/source references and the campaign ID are retained in the job record. Memory and role boundaries separate research, creative work and actual publishing.

Campaign Delivery polls every five minutes. It reads one unfinished job, inspects actual provider readiness, archives completed media through TH-Server and performs at most two write transitions per cycle by default (editable 1–4). Subsequent cycles resume from durable channel receipts. Long media generation/upload is not treated as already published. Missed time windows coalesce; the system does not backfill a flood of posts. A failed producer after a window claim is not automatically resubmitted as another paid media job.

Destination setup:

- **Facebook:** Page access token, exact Page ID and Page publishing permissions/app review as applicable. Photos post with captions; video remains processing until the platform reports publication.
- **Threads:** Threads-specific OAuth token, exact user ID, `threads_basic` and `threads_content_publish`. Preparation and publication are separate persisted stages. A Facebook token is not interchangeable.
- **TikTok:** creator authorization, `user.info.basic`, `video.publish`, Direct Post app approval/audit and domain/URL-prefix verification for `ai.th.io.vn` (media is served from `/api/media/shared/`). Choose a creator-allowed privacy option; default `SELF_ONLY`. Images use the photo API and videos the Direct Post video API. Optional OAuth client/secret/refresh-token fields renew access tokens; bare tokens require renewal. Platform restrictions may limit unattended scheduling; only use features your approved application/account is permitted to use.
- **YouTube:** enable YouTube Data API and reconnect Google with YouTube read + upload scopes. Configure the exact owned channel ID. The publisher creates a resumable session, streams the archived video and checks processing status. Default privacy is **private**, explicitly editable. YouTube Data API does not publish a still image as a community post; image-only jobs are explicitly skipped for YouTube.

Destination account IDs, permissions, app review and billing must be supplied by the owner. Tokens are server-side. Providers may charge for models/media, enforce quotas, restrict accounts or require renewal. A verified connection does not prove every publishing permission is present; actual responses determine status. No account was connected or paid job submitted by the implementation tests.

Media URLs are signed per file and expire within 24 hours. Only approved safe image/video types are served by this capability route; normal files remain owner-private. Generating/posting intentionally transfers media to the selected platforms. The media archive retains its existing 64 MB per-file limit; provider/upload and 180-second workflow deadlines still apply. No paid generation/upload is retried automatically.

Each external write has a durable intent before sending and a receipt afterwards. A crash/timeout/uncertain acknowledgement is **not** automatically replayed. Scheduled publishing pauses for owner review. Open **Media jobs → Publishing receipts**, inspect the exact provider/account record, then confirm its record ID, skip it or explicitly authorize retry only after confirming no post exists. Save the review before enabling Auto again. This prevents duplicate posts; it does not claim an atomic transaction across external platforms.

## Market intelligence

Watches use API-authorized merchant/catalog data. Shopee fetches item details after listing IDs. Competitor-wide monitoring requires an authorized/ licensed partner feed or an approved read connector; the templates do not bypass marketplace access restrictions or pretend an owned-shop list is the whole market.

Market Snapshot retains observed prices, stock/supplier fields when present, a timestamp, configured currency/source and a CSV/Markdown report. Missing costs, shipping, ratings/review counts stay **unknown**. Estimated margin is computed only with supplied price, cost and shipping, using the configured fee percentage. There is no invented supplier reliability score or implicit currency conversion. CSV text fields are protected against spreadsheet-formula injection. History/Drive snapshots retain successive reports; use an analyst + Memory or a consolidated authorized feed for longitudinal/cross-store analysis.

## Sales and customer replies

Distribution Planner proposes allocations/follow-up priorities using actual order data; missing inventory and cost evidence is stated. It does not mutate stock or collect payments.

Confirm Paid Orders and Customer Care require a real authorized incoming event (`receivedAt`, consent and event/order IDs). Defaults cannot act. Events expire after 24 hours in the starter rules. The paid-order adapter re-reads WooCommerce payment/status before a PUT; it does not capture payment and treats an already-processing paid order as unchanged. Customer Care sends a customer-facing WooCommerce order note, with a separate claim per incoming message. Map an actual inbox/feed to the event schema before enabling Auto. Shopee/TikTok Shop order/messaging operations need their separately approved partner APIs/adapters; the runnable customer-care adapter in this release is WooCommerce.

## Website, community and advertising

Community Reply reads comments on an owned Facebook post, limits each batch to two recent comments (24 hours), keeps the original trusted comment ID outside the model response and claims each comment before replying. It does not create synthetic likes, follow-backs or unsolicited messages.

Website Editor targets WordPress REST using a dedicated account/Application Password. Posts default to **draft**; publishing requires changing that setting and approving the write block. Custom websites need their own authenticated CMS/REST connector; this does not grant blanket control over arbitrary websites.

Advertising Creative Desk generates copy variants and a campaign/creative plan. The optional Meta block is disabled/disconnected until configured with an ad account, existing ad set and approved creative ID. It creates only a **PAUSED** ad. This release contains no ad-activation or budget-spending block.

## Native logic and execution

Auto Input; If / Else; AND/OR rule gates; Switch; Action (map/pick/remove/wrap/restore context); Information; Parse JSON; bounded For Each; Limit; Once per Key; Merge / Any Input; Market Snapshot; Campaign Media Queue; Multi-channel Publisher.

AND/OR evaluate rules on one payload, not multiple incoming executions. Merge takes the first arriving branch per iteration; it does not wait for or aggregate all inputs. For Each runs sequentially with separate downstream identities and a batch limit of 1–20, subject to the existing 80-step and 180-second execution caps. Optional timestamp filtering rejects stale/invalid timestamps. Declarative transformations never execute arbitrary expressions. Parse JSON can preserve trusted context instead of accepting a model-generated destination ID.

Once per Key claims a scalar key transactionally before side effects (30-day retention, 1,000 keys per workflow/namespace). Claims are intentionally conservative: failures after claiming may require inspection before a reviewed retry. Do not rotate a namespace blindly to bypass duplicate protection.

Ordinary steps/traces still use RAM with durable admission/final checkpoints. Claims, external-write intents and receipts add necessary persistence at side-effect boundaries. Auto remains one worker on this Pi. These owner templates are suitable for bounded personal workloads; commercial multi-tenant/high-volume operation needs isolated workers, durable job queues and stronger hardware.

Animations reflect actual trace status: active edges, running icon rings/activity bars, success/failure and reduced-motion support. Moving a block does not recheck credentials or execute a provider request.

Official protocol references: [TikTok Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), [TikTok media transfer/domain ownership](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide), [YouTube resumable uploads](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol), [Meta's Threads API collection](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api).

Trend Search is an explicit paid search invocation before the research model. Provider citation URLs are preserved as trusted context through the creative stages; a model-generated replacement source list does not overwrite those URLs. Parsed model output checks required field types before media generation.

## Search provider setup and 403 errors

New Trend Search blocks default to OpenAI Web Search (Responses API), reusing the existing OpenAI connection. Choose a web-search-capable model; the recommended default can be changed. Actual search execution and citation metadata are required, with one hosted tool-call allowance per request. Search/model fees still apply. Existing saved Perplexity blocks retain Perplexity until the owner explicitly selects another provider and Checks again. There is no automatic paid fallback.

A Perplexity HTTP 403 means that endpoint denied the request; inspect the saved Sonar API key, API project permissions/billing and provider restrictions. It does not mean OpenAI failed. The UI now names the failed provider and offers the provider selector. API subscriptions/credits and model/tool permissions remain account-specific. See [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search).

OpenAI provider selection for new model blocks now defaults to `gpt-6.1-sol`. Existing saved workflows keep their selected IDs. **Use latest recommended model available** checks the API account model list before choosing the maintained recommendation; unavailable recommendations do not replace the current model silently. Selecting a different model requires Check/save again and may change price/latency. [Current OpenAI code/model guidance](https://developers.openai.com/api/docs/guides/code-generation).
