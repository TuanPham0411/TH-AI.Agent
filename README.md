# TH AI.Agent Studio

Independent workflow studio at https://ai.th.io.vn. Built-in agents, typed drag-and-drop connections, JavaScript Functions, cloud models, database reads, add-ins, statistics, reports and server timers. No n8n dependency.

See [Studio setup and architecture](docs/STUDIO.md). Shared Drive-first storage, timer supervision and Function isolation are managed by TH-RPI.Server. Provider credentials must be configured privately by the owner; integration availability depends on each platform and its API permissions.

`npm ci`, `npm test`, `npm run build`. Database integration tests use a disposable `TEST_DATABASE_URL`. `node tests/editor.browser.mjs` tests the real editor with Chromium. The Studio workflow builds immutable AMD64/ARM64 Docker images, deploys through the existing self-hosted AI runner, and checks the public editor.

Previous Prompt Studio drafts and data remain in the database. Retired n8n data is preserved separately for recovery and is not part of Studio execution.
