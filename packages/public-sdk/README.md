# @universal-form-autofill/sdk

Form autofill engine, React panel and Chrome extension bridge, bundled into one package with no runtime
dependencies. React 18.2+ or 19 is a peer dependency, only needed for `/react`.

| Import                                           | Contents                                                        |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `@universal-form-autofill/sdk`                   | Headless controller, field scanner, plugin registry, storage    |
| `@universal-form-autofill/sdk/react`             | `AutofillPanel`, `AutofillRoot`, theming, hooks                 |
| `@universal-form-autofill/sdk/extension`         | `createExtensionAutofillHost` for side panels and popups        |
| `@universal-form-autofill/sdk/content`           | The page runtime, for hosts that ship their own content script  |
| `@universal-form-autofill/sdk/style.css`         | Scoped styles (every class is `ufa:`-prefixed, no global rules) |
| `@universal-form-autofill/sdk/content-script.js` | Prebuilt page runtime (IIFE) injected into tabs                 |

## Add it to an extension

1. Copy the page runtime into your static folder as part of your build:

   ```sh
   ufa-assets public/form-autofill
   ```

2. Render the panel from any extension page:

   ```tsx
   import '@universal-form-autofill/sdk/style.css'
   import { AutofillPanel, cssVariableTheme } from '@universal-form-autofill/sdk/react'
   import { createExtensionAutofillHost } from '@universal-form-autofill/sdk/extension'

   const host = createExtensionAutofillHost({
     chrome,
     contentScriptFile: 'form-autofill/content-script.js',
     storageNamespace: 'my_extension_autofill',
   })

   export function FormAutofill() {
     return <AutofillPanel host={host} theme={cssVariableTheme()} embedded />
   }
   ```

`cssVariableTheme()` reads shadcn-style variables (`--primary`, `--background`, …) from the host and
falls back to the built-in palette for any that are missing.

## Permissions

The host extension needs `scripting` and `storage`, plus either `activeTab` (access granted per click)
or host permissions for the sites it should fill. Without the `tabs` permission the panel cannot read
the active tab's URL until access is granted, and it says so.

## Privacy

Profiles and settings stay in the storage you pass in (`chrome.storage.local` by default). The SDK makes
no network requests, never submits forms, and never fills or learns passwords, one-time codes or payment
details.
