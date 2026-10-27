# @universal-form-autofill/sdk

Form autofill engine, React panel and Chrome extension bridge, bundled into one package with no runtime
dependencies. React 18.2+ or 19 is a peer dependency, only needed for `/react`.

## Install

The package is published as `@jayaprakash9603/universal-form-autofill`. Install it under the
`@universal-form-autofill/sdk` alias so the imports below work as written:

```sh
npm install @universal-form-autofill/sdk@npm:@jayaprakash9603/universal-form-autofill
```

| Import                                           | Contents                                                        |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `@universal-form-autofill/sdk`                   | Headless controller, field scanner, plugins, store and adapters |
| `@universal-form-autofill/sdk/react`             | `AutofillPanel`, data views, `AutofillRoot`, theming, hooks     |
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

## Profiles and saved answers

The panel includes Answers, Profiles and Data tabs and a profile selector. To manage the same data on
another page, such as a settings screen, render the views with the host's shared store:

```tsx
import { AnswerLibrary, AutofillRoot, ProfileManager } from '@universal-form-autofill/sdk/react'

const store = host.getStore()

export function AutofillSettings() {
  return (
    <AutofillRoot>
      <ProfileManager store={store} />
      <AnswerLibrary store={store} />
    </AutofillRoot>
  )
}
```

`DataManager` (export, import, delete all), `CustomFieldsManager` and `ProfileSelector` work the same
way. Without the extension bridge, build a store directly:
`createAutofillStore({ adapter: createIndexedDbStorage() })`.

## Matching

`controller.getState().matches` holds one result per detected field: its state (`matched`,
`suggested`, `ambiguous`, `incompatible`, `missing`, `skipped` or `unsupported`), the best answer
with the value it would put in that control, a confidence score and level, and a sentence explaining
why. The panel's Page tab shows the same information. To add matching rules, register them:

```ts
import { createAutofill, PluginRegistry, PLUGIN_API_VERSION } from '@universal-form-autofill/sdk'

const registry = new PluginRegistry().registerMatcher({
  id: 'acme.employee-id',
  apiVersion: PLUGIN_API_VERSION,
  order: 15,
  match: (field, answers) =>
    field.name === 'empId'
      ? answers
          .filter((answer) => answer.semanticKey === 'custom:employee-id')
          .map((answer) => ({
            answerId: answer.id,
            score: 0.95,
            explanation: 'Acme employee id field',
          }))
      : [],
})

const controller = createAutofill({ driver, storage, registry })
```

`matchFields`, `classifyFields` and `toFieldValue` are exported for hosts that match outside a
controller.

## Permissions

The host extension needs `scripting` and `storage`, plus either `activeTab` (access granted per click)
or host permissions for the sites it should fill. Without the `tabs` permission the panel cannot read
the active tab's URL until access is granted, and it says so.

## Privacy

Profiles and settings stay in the storage you pass in (`chrome.storage.local` by default). The SDK makes
no network requests, never submits forms, and never fills or learns passwords, one-time codes or payment
details.
