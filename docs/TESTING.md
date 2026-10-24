# Testing

## Workspace

```bash
pnpm verify          # lint, typecheck, unit tests, deps, public API snapshot, builds
pnpm test            # Vitest unit tests
pnpm check:tree-shaking  # headless vs react SDK bundle boundaries
pnpm verify:e2e      # build dist-e2e + Playwright
pnpm ci:sdk          # release/sdk + consumer smoke + API snapshot
pnpm ci:extension    # extension build + E2E
```

E2E loads `apps/chrome-extension/dist-e2e`. Rebuild after UI or runtime changes.

## Packages

- **Core / matching / form-actions / synthetic-data / portal-adapters**: deterministic Vitest suites with jsdom.
- **autofill-sdk**: controller tests against `createDomPageDriver`.
- **ui**: React Testing Library for panel states.

## Host (Browser Toolbox)

From the parent repo, run that project’s lint, typecheck, test, and build after changing the vendored SDK or integration tool.
