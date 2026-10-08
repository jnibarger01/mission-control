# ACS Overview (PR1, read-only)

This page is available at `/acs-overview` in Mission Control. It does not replace the existing dashboard, database, task board, or native OpenClaw controls.

## Runtime

- ACS Fastify gateway: `http://127.0.0.1:3000`
- Mission Control Next.js UI: `http://localhost:3001`
- The server-side adapter defaults to the ACS gateway on loopback.
- Requires the known-good Node 22 runtime for Mission Control's native SQLite module.

## Access

This initial integration intentionally requires a logged-in **Mission Control admin**. This is a narrow Phase 1 gate, not ACS identity federation. The authenticated backend route `GET /api/acs/overview` has no mutation handler and sends `Cache-Control: no-store`.

To enable protected ACS projections, set `ACS_READ_TOKEN` in the **server process environment**, with a credential provisioned by ACS that has **only** `acs:read` scope. Do not put this token in a `NEXT_PUBLIC_*` variable, browser storage, a committed file, or the user-facing configuration page.

Optional `ACS_BASE_URL` defaults to `http://127.0.0.1:3000`; only loopback HTTP endpoints are accepted. Without a token, the overview reports protected data as unavailable instead of silently displaying false zeros. A failed or unauthorized upstream read is also unavailable.

## Data and limitations

The page reads `/readyz`, `/work-items?limit=100`, `/api/agents`, `/execution-mode`, and `/api/events?limit=5`. The UI labels work-item counts as **loaded page counts**, never system-wide totals. Audit entries include only name and timestamp; event bodies and raw attributes are never returned.

There is no live ACS SSE bridge, ACS operator identity federation, governed write control, or ACS-authenticated interactive approval action in PR1. Those belong to later PRs.

## Test and acceptance

- `node node_modules/vitest/vitest.mjs run src/lib/acs/overview.test.ts src/lib/__tests__/acs-overview-route.test.ts`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/eslint/bin/eslint.js src/lib/acs/overview.ts src/app/api/acs/overview/route.ts src/components/panels/acs-overview-panel.tsx`
- Build and smoke-test using Node 22 in the isolated worktree.

Neither port nor production service configuration is changed in this PR. Production deployment, merge and changes to ACS are explicitly excluded.
