# Dependencies

## Workspace packages

Internal packages (`@ufa/*`) are private and linked with pnpm. Only `@universal-form-autofill/sdk` is published as `release/sdk`.

## Runtime highlights

| Area | Libraries |
|------|-----------|
| UI | React 19, Radix UI, Tailwind CSS 4 |
| Validation | Zod |
| Extension | `@crxjs/vite-plugin`, Vite |

## Review

- Run `pnpm check:deps` (dependency-cruiser) on every CI build; it enforces package direction and demo-host isolation.
- Third-party licenses are available via each package’s `node_modules/<name>/LICENSE` after `pnpm install`.
- Keep the published SDK **zero runtime dependencies**; peers are React only.
