# Universal Form Autofill

A Chrome extension and an embeddable SDK that detect form fields, match them to answers you saved,
and fill them only after you review them. Everything stays on your device.

- `apps/chrome-extension`: the standalone MV3 extension.
- `packages/public-sdk`: builds `@universal-form-autofill/sdk` into `release/sdk` for other extensions.
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Commands

Requires Node 20.19+ and pnpm 10.

```sh
pnpm install
pnpm dev:extension     # side panel dev server (load apps/chrome-extension/dist)
pnpm build             # SDK release + extension build
pnpm verify            # lint, typecheck, unit tests, dependency rules, builds
pnpm test:package      # install release/sdk into a scratch project and check it
pnpm e2e               # Playwright against the unpacked extension
```

To load the extension, build it and choose **Load unpacked** on `chrome://extensions` with
`apps/chrome-extension/dist`.
