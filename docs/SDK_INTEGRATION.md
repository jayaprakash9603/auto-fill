# SDK integration

Use **`@universal-form-autofill/sdk`** when you embed autofill in another Chrome extension or web app.

## Choose an integration shape

| Need | Import |
|------|--------|
| Full side panel / options UI | `@universal-form-autofill/sdk/react` (`AutofillPanel`, `AutofillRoot`) |
| Headless controller only | `@universal-form-autofill/sdk` (`createAutofill`, types) |
| Extension tab + content script bridge | `@universal-form-autofill/sdk/extension` (`createExtensionAutofillHost`) |
| Page runtime (content script) | `@universal-form-autofill/sdk/content` |

Copy `content-script.js` and `style.css` from the built SDK (`release/sdk`) with the `ufa-assets` CLI after `pnpm build:package`.

## Demo host

`apps/demo-host-extension` is a minimal MV3 extension that depends **only** on the public SDK package. Build it with:

```bash
pnpm --filter @ufa/demo-host-extension build
```

## Custom UI

Create a host (`createExtensionAutofillHost` or your own `AutofillHost`), call `host.createController()`, subscribe to `controller.getState()`, and wire your components to `fill`, `generate`, `clear`, and `undo`. Reuse `@ufa/core` types from the SDK entry when you need field or match shapes in your UI.
