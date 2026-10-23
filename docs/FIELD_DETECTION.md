# Field detection

`@ufa/field-detection` turns a live document into a list of `FieldDescriptor`s: what each control is,
what it asks, where it sits, whether it can be used, and whether it is sensitive. It runs where the
DOM lives (the injected page runtime, an in-page host, or a test) and never changes the page.

```ts
import { createFieldScanner, BUILTIN_DETECTORS } from '@universal-form-autofill/sdk'

const scanner = createFieldScanner({ document, detectors: [...BUILTIN_DETECTORS, myDetector] })
const fields = scanner.scan() // visible, editable fields in document order
const all = scanner.scan({ includeHidden: true, includeDisabled: true })
```

Most hosts never call the scanner directly: `controller.connect()` scans every reachable frame and
keeps `state.fields` current.

## Pipeline

1. **Index the tree.** Walk the document depth-first, descending into every open shadow root. This
   gives document order across shadow boundaries, the list of shadow roots, and the headings used for
   section context.
2. **Detect.** Run each detector, in `(order, id)` order, over the document and every shadow root.
   A detector returns `DetectedControl`s. The first detector to return an element claims it (and the
   members of a group); later detectors skip claimed elements. A detector that throws or returns
   malformed controls is reported through `onPluginError` and skipped.
3. **Describe.** Resolve the label, section, form title, options, current value, visibility,
   editability and sensitivity of each control.
4. **Filter and order.** Drop hidden and disabled/read-only controls unless the request includes them,
   sort by document position, and number them.
5. **Identify.** Assign each field a session-stable id (below).

## Built-in detectors

| Detector              | Order | Finds                                                                                                                                                                                                                                           |
| --------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ufa.native-controls` | 100   | `input` (except hidden, submit, button, reset, image), `select`, `textarea`. Radios sharing a name in one form become a radio group; checkboxes sharing a name become a checkbox group. Inputs with or inside `role="combobox"` are comboboxes. |
| `ufa.aria-widgets`    | 200   | `textbox`, `searchbox`, `combobox`, `listbox`, `radiogroup`, `checkbox`, `switch`, `spinbutton`, `slider` roles on non-native elements. A listbox owned by a combobox (`aria-controls`/`aria-owns`) is part of that combobox.                   |
| `ufa.contenteditable` | 300   | Top-level `contenteditable` regions nobody else claimed.                                                                                                                                                                                        |

Portal adapters (Phase 8) add detectors with a lower `order`, so they claim portal widgets first.

### Unsupported controls

Controls that cannot be operated reliably are still reported, with `support: 'unsupported'` and a
reason, instead of being guessed at: file inputs (never automated), sliders, color pickers, custom
spin buttons, and ARIA text boxes without an editable area.

## Labels

Single controls take the first label found in this order:

1. `<label for>` or a wrapping `<label>` (`label-for`, `label-wrap`).
2. `aria-labelledby` (text of the referenced elements, even when hidden), then `aria-label`.
3. The legend of a fieldset that contains only this control (`legend`).
4. `title`.
5. `placeholder` (also `aria-placeholder`), unless it looks like an example ("e.g. Acme", an email
   address, a URL, a phone number).
6. Nearby text (`adjacent-text`): text just before the control, climbing a few ancestors but never
   past a form, fieldset, table or list, and stopping at anything containing another control. Then the
   previous cell or the column header in tables, then the `<dt>` of a `<dd>`.
7. A humanized `name` or `id` (`name`), ignoring generated identifiers such as `input-12` or `:r5:`.

Radio and checkbox groups use their own order, because member labels are option labels: the group's
`aria-labelledby`/`aria-label` (`group-aria`), then a question written just before the first option
inside the fieldset (`adjacent-text`, with the legend kept as section), then the fieldset legend, then
the shared `name`.

Label text skips scripts, nested controls (a wrapping label does not absorb a select's options) and
hidden elements. Leading or trailing `*`, `(required)` and trailing colons are stripped and set
`required`; an asterisk counts even inside `aria-hidden`. `normalizedLabel` comes from core's
`normalizeLabel`, which also maps synonyms ("Given name" and "First name" normalize alike).

When a label comes from heuristics (nearby text, placeholder, title or name), the panel says so.

## Context

- **Section:** the nearest fieldset legend not used as the label, then the nearest named region
  (`section`, `role="region"` or `role="group"` with an accessible name), then the closest heading
  before the control inside its form. These lookups continue through shadow hosts.
- **Form title:** the form's accessible name, else the closest heading before the form.

## Values, options and state

- Options come from `<option>`s (with `optgroup` disabling), group members, `role="option"` children
  of a listbox, a combobox's controlled listbox (even while its popup is closed), or a `<datalist>`.
- `currentValue` is text, a checked state, or the selected option values. A select-only combobox
  showing prompt text such as "Select…" counts as empty.
- **Prohibited fields are never read.** Their `currentValue` is null, `hasValue` is false and their
  options are not collected.
- `editable` is false for disabled controls (including through a disabled fieldset and
  `aria-disabled`) and read-only ones (`readonly`, `aria-readonly`).

## Visibility

With layout (a real browser), a control is visible when `checkVisibility()` passes, it is at least 2px
in some dimension, and it is not positioned entirely above or left of the page, which is how most
honeypots hide. Controls inside `inert` or `aria-hidden="true"` subtrees are hidden. Without layout
(jsdom) the scanner walks computed styles instead: `display: none`, `visibility: hidden`,
`content-visibility: hidden`, the `hidden` attribute, and closed `<details>`.

Native radios and checkboxes count as visible when their label is, because custom-styled controls
often hide the input itself.

## Stable ids

Field ids look like `f1a2b3c4-7`: a random prefix per scanner (so frames and reloads never collide)
and a counter.

- The same element keeps its id across rescans.
- When a framework re-renders a control, the new element takes over the id of a detached element with
  the same **fingerprint**: a hash of type, tag, input type, `name`, `id`, normalized label and member
  count. Values are never part of a fingerprint.
- `scanner.resolve(id, fingerprint)` re-finds the live element before an action. It throws
  `FIELD_NOT_FOUND` when the field is gone and `FIELD_CHANGED` when the control at that id no longer
  matches the fingerprint the caller saw.

## Dynamic pages

After the first scan, the DOM driver starts a `MutationObserver` on the document and every open
shadow root, filtered to childList, text and the attributes that can add, reveal, relabel or disable a
control. Bursts of mutations are debounced (300 ms). The driver then rescans, and emits
`fields-changed` only if the structural signature changed. Ids, fingerprints, visibility,
editability, required state, support, section and option counts are in the signature; values are not,
so typing never triggers an update. Shadow roots that appear later are picked up on the next rescan.

In an extension, each frame's runtime does this independently. The tab driver stamps each event with
the sender's `frameId`, and the controller replaces just that frame's fields.

## Writing a detector

```ts
import { PLUGIN_API_VERSION, type FieldDetector } from '@universal-form-autofill/sdk'

export const ratingDetector: FieldDetector = {
  id: 'acme.star-rating',
  apiVersion: PLUGIN_API_VERSION,
  order: 50, // before the built-ins
  detect(root, context) {
    return Array.from(root.querySelectorAll('acme-rating'))
      .filter((element) => !context.isClaimed(element))
      .map((element) => ({
        kind: 'range',
        element,
        // An empty override falls back to the normal label resolution.
        labelOverride: element.getAttribute('question') ?? '',
        unsupportedReason: 'Star ratings are not supported yet.',
        confidence: 0.9,
      }))
  },
}
```

`detect` is called once for the document and once per open shadow root. It must not modify the page.
Hosts that bundle their own content script pass detectors to `installExtensionContentRuntime({
detectors })` or `createDomPageDriver({ detectors })`.

## Known limitations

- Closed shadow roots are invisible to any script, so their controls are not detected.
- Cross-origin frames, and frames added after the panel connected, are scanned only when the panel
  (re)connects and the extension can inject into them.
- In shadow trees with slots, light-DOM children are ordered after the shadow content.
- Comboboxes that load options asynchronously report only the options currently in the DOM.
- Value changes made without DOM mutations (typing, scripted `value` assignments) do not refresh the
  list; it updates on the next structural change or refresh.
