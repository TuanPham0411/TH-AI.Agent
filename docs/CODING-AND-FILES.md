# Coding agents, attachments and output files

## API coding blocks

**Codex API Agent** uses OpenAI Responses. **Claude Code API Agent** uses Anthropic Messages. These are API coding assistants in this Studio, not the vendors' CLI applications. They analyze supplied context and return prose, code or a proposed unified diff. They cannot read a repository, run commands/tests, edit files, commit or deploy. Outputs explicitly include `mode: api`, `applied: false`, `testsRun: false`; an incomplete provider response never becomes an applicable patch.

Connect Chat Trigger → coding block → Output, or connect its Tool port to a role permitted to delegate. Memory is optional. Save/test the provider key in Connections, choose a model visible to that key, set task/context/response format and output token budget (512–16,000; default 4,096), Check and approve paid provider use. No separate key is needed if the provider connection already exists. Model IDs and API billing are account-specific. Model discovery is read-only and never changes a model automatically. Auto counts these blocks as paid requests and requires explicit node approval/quota.

## Input

Use **Attach files**, drag/drop or paste file/image data into the composer. Owner attachment storage is private. Files are uploaded in 256 KB chunks, up to five attachments per request and 16 MB/file. Completion is acknowledged only after the existing TH-Server Drive-first transaction commits. An interrupted upload before completion is not acknowledged as durable; retry attachment after a server restart. If the final checkpoint fails, use **Retry saving**, which retries completion without uploading another copy. Removing an attachment from the composer does not delete its stored/recovery copy.

A run stores file IDs/metadata, not base64 in its graph or conversation history. Before a model call the backend resolves IDs from the private files table, enforces confined paths and reads canonical metadata/bytes. At most 6 MB total is sent inline to a model; text documents have a 120,000-character budget. No extra model request is used to extract plain text.

- Compatible Gemini models: images, PDF, inline MP4/WebM video and text.
- Compatible OpenAI Chat Completions models: images and text.
- Codex Responses: images, PDF and text.
- Compatible Claude models: images, PDF and text.
- Office/ZIP/other binaries can be stored and passed as file references to service blocks, but are not silently presented as model-readable documents. Convert them to text/PDF first.

The selected model must support the supplied modality; provider permissions, limits and billing still apply. Unsupported modalities are rejected before the paid request. Attached data is sent to the selected provider when a paid run is approved. No transcription/video conversion is silently performed.

**Run JavaScript** runs a local preview in the existing isolated browser worker (one-second compute limit; no network, filesystem, secrets or packages). Use its result as workflow input to save/process it. It does not run shell commands, Python or repository code on the Pi. Use the Function block for persisted server workflow JavaScript.

## Output

Chat/Output render downloadable files and safe same-origin image/video previews. Raw model HTML/SVG is never executed. A workflow can return existing file descriptors or produce small files, for example:

```js
return {
  text: 'Report ready',
  files: [{name: 'report.csv', type: 'text/csv', content: 'name,value\nexample,42'}]
};
```

`encoding: base64` is supported for binary contents. Generated files are converted to durable file references in the same final run checkpoint (up to five files and 1 MB total, also subject to the existing 180 KB per-step JSON output limit). Before the checkpoint acknowledges, results are still marked Saving. File registration and output references commit together. Browser sandbox previews can download inline contents but are not durable until used in a saved server workflow.

For asynchronous media jobs, **Refresh & archive preview** polls the existing job and archives completed media through TH-Server/Drive before displaying a local preview. It does not submit/retry paid media generation. External provider URLs are not auto-loaded into the chat. File downloads and previews require owner authentication; Firebase member execution/storage integration remains separate.
