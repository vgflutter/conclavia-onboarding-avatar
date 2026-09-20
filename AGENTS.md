# Conclavia Onboarding Avatar

- Independent service. Keep customer-specific questionnaires and mappings in the customer's adapter, never in the conversation engine.
- Reuse the existing Mongo connection; write only `onboarding_*` collections. Never alter meeting or AIHat collections.
- Secrets are server-only. Do not print environment files, client keys, session capabilities or raw provider errors.
- The host application owns identity, financial scoring and final submission. An onboarding completion is confirmed structured data, not a financial operation.
- Published flow/avatar/context snapshots stay immutable for active sessions. Validate all model outputs against the snapshot; model text cannot complete a session.
- Run unit tests, lint, typecheck and build. Tests must not use customer records or paid providers. Live microphone quality must be reported separately from automated fixtures.
- Read the relevant Next.js guides in `node_modules/next/dist/docs/` before changing framework code.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Shared avatar ownership

- Renderer, animation, asset, voice-catalog and playback implementations belong to `../conclavia-avatar-kit`, used by both Conclavia applications. Preserve the consumer compatibility re-exports; do not introduce local copies.
- After shared changes, run `npm run check:avatar-kit` with both consumers installed, then the relevant avatar/player regressions and both consumer builds. Keep the three Git checkouts side by side and publish kit changes before dependent consumer changes.
