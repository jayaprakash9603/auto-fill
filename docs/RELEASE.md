# Release

## Versioning

Internal packages use the workspace version `0.1.0`. The published artifact is **`release/sdk`** (`@universal-form-autofill/sdk`), built by:

```bash
pnpm build:package
pnpm test:package
```

## Changesets

```bash
pnpm changeset          # describe a change
pnpm changeset version  # bump versions from changesets
```

`.changeset/config.json` ignores `@ufa/*` workspace packages; only the public SDK package is intended for external consumers today.

## Checks before release

- `pnpm verify` — lint, types, unit tests, dependency graph, public API snapshot, builds
- `pnpm verify:e2e` — extension E2E (requires Playwright Chromium)
- `node scripts/collect-public-api.mjs` when adding or removing public exports

## Pipelines

| Script | Scope |
|--------|--------|
| `pnpm ci:sdk` | Published SDK bundle + consumer smoke test |
| `pnpm ci:extension` | Chrome extension production build + E2E |
| Browser Toolbox | Parent repo lint/typecheck/test/build after vendoring `release/sdk` |
