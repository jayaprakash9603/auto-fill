# Testing

## Workspace

```bash
pnpm verify          # lint, typecheck, unit tests, dependency graph, SDK build
pnpm test            # Vitest unit tests
pnpm --filter @ufa/chrome-extension build:e2e
pnpm e2e             # Playwright (extension + fixture forms)
```

E2E loads `apps/chrome-extension/dist-e2e`. Rebuild after UI or runtime changes.

## Packages

- **Core / matching / form-actions / synthetic-data / portal-adapters**: deterministic Vitest suites with jsdom.
- **autofill-sdk**: controller tests against `createDomPageDriver`.
- **ui**: React Testing Library for panel states.

## Host (Browser Toolbox)

From the parent repo, run that project’s lint, typecheck, test, and build after changing the vendored SDK or integration tool.
