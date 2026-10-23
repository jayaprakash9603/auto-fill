# Data model

Everything Form Autofill remembers lives in one **store** (`createAutofillStore`, in
`packages/storage`) on top of a `StorageAdapter` the host chooses. Nothing is sent anywhere: the
engine makes no network requests, and the only copies of the data are the storage area and the export
files the user downloads.

## Collections

The store keeps one JSON document per collection, each under its own storage key (prefixed by the
adapter's namespace, for example `ufa:answers` in the extension or `browser_toolbox_autofill:answers`
in the toolbox).

| Key            | Contents                                                                         |
| -------------- | -------------------------------------------------------------------------------- |
| `meta`         | `schemaVersion`, `createdAt`, `updatedAt`. Written last; marks the data as valid |
| `profiles`     | `Profile[]`                                                                      |
| `answers`      | `AnswerRecord[]`, both global answers and profile answers                        |
| `customFields` | `CustomFieldDefinition[]`                                                        |
| `mappings`     | `FieldMapping[]`: confirmed "this field on this site uses that answer" bindings  |
| `settings`     | `AutofillSettings`, including `activeProfileId`                                  |

Every record type has a Zod schema in `packages/core/src/domain`, and every read is validated. Size
limits are part of the schemas (for example 300 characters per label, 20,000 per text value, 200 list
items) so a corrupted or hostile document cannot exhaust memory.

### Profile

```ts
interface Profile {
  id: string
  name: string // unique, case-insensitive
  description: string
  kind: 'general' | 'role' | 'custom'
  isDefault: boolean // exactly one profile is the default
  templateId: string | null // blank template it was created from
  createdAt: number
  updatedAt: number
}
```

The **active profile** is the one used for filling: `settings.activeProfileId` when it exists,
otherwise the default profile, otherwise the first. Switching is a settings write, so every page that
uses the same storage (side panel, options page, toolbox tool) follows it.

### AnswerRecord

```ts
interface AnswerRecord {
  id: string
  label: string // the question as the user knows it
  semanticKey: string | null // catalog key ('email') or custom field key ('custom:office')
  aliases: { text: string; normalized: string }[] // other labels it should match
  value:
    | { kind: 'text'; text: string }
    | { kind: 'boolean'; value: boolean }
    | { kind: 'list'; items: string[] }
  profileId: string | null // null = global, available to every profile
  category: AnswerCategory
  controlTypes: FieldType[] // empty = any compatible control
  context: {
    sites: string[] // hostnames, suffix match; empty = any site
    sectionKeywords: string[] // normalized words the section heading must contain
    formKeywords: string[] // normalized words the form or page title must contain
    applicationTypes: string[]
  }
  tags: string[]
  preferred: boolean
  source: 'manual' | 'learned' | 'imported'
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  usageCount: number
}
```

A profile sees its **own answers first, then global answers** (`answersForProfile`). Context rules
let one question have several answers, for example a different "Why this company?" per site.

### CustomFieldDefinition

A field the catalog does not know, such as "Preferred office". Its key is `custom:<slug>`, derived
from the first label and kept when the label is renamed, so answers that point at it stay attached.
Its label must not collide with a built-in catalog label or alias, and labels that look like secrets
are rejected. Deleting a custom field keeps its answers as free answers (their `semanticKey` is
cleared).

### FieldMapping

`{ id, site, fieldSignature, answerId, profileId, createdAt }`, where `fieldSignature` is
`normalizedLabel|fieldType` so the binding survives re-renders. Mappings are deleted with their
answer or profile and repointed when answers are merged.

## Profiles and templates

`PROFILE_TEMPLATES` (in `core/src/domain/profiles.ts`) are **blank** schemas: lists of semantic keys,
never values.

| Template             | Lists                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `general`            | Current designation and employer, experience, notice period, expected salary, work mode, relocation, summary |
| `software-developer` | The general fields plus skills, languages, degree, field of study, university, graduation year, cover letter |
| `software-testing`   | The general fields (without relocation) plus skills, degree, university and cover letter                     |
| `custom`             | Nothing; the user adds answers in the library                                                                |

`SHARED_PROFILE_FIELDS` (name, email, phone, address, public profile links) rarely change between
roles. The profile details form lists them for every profile and saves them **once, as global
answers**. The template's own fields are saved as **profile answers**. Clearing a field in the form
removes its answer. The first run creates a single blank "General" profile; no real user details
exist anywhere in source code.

## Duplicates, conflicts and preferred answers

Answers are grouped by `(profileId or global, answer key, context)`, where the answer key is the
semantic key when there is one and the normalized label otherwise.

- **Exact duplicate:** same group and same normalized value. Creating one returns the existing answer
  (`{ created: false }`) instead of saving a copy, unless `allowDuplicate` is passed.
- **Conflict:** same group, different values, none marked preferred. The library reports conflicts so
  the user can choose. Matching reports such fields as `ambiguous` and proposes neither.
- **Preferred:** at most one answer per group. Marking another one preferred clears the previous one.

`findDuplicateAnswers` returns both lists. `answers.merge(keepId, ids)` folds duplicates into one
record: aliases, labels and tags are unioned, usage counts summed, and mappings repointed.

## Write-time safety

`prohibitedAnswerReason` runs the field sensitivity classifier over an answer's label and aliases,
plus the label and aliases of the field it points at. Answers that look like passwords, one-time
codes, payment data, tokens or other prohibited fields are rejected on create and update. The same
check guards custom field labels. Imports apply both checks and skip what fails, with a warning,
including answers saved for a skipped custom field. Values are only ever stored as data: nothing in a
saved or imported record is evaluated or executed.

## Store guarantees

- **Lazy.** Creating a store touches no storage; `ready()` loads it. `ready()` never rejects; failures
  become `status: 'error'` with a reason.
- **Serialized writes.** Mutations run one at a time and re-read storage before changing it, so two
  quick edits never overwrite each other within a page.
- **Validated reads, preserved data.** Invalid records are reported as `issues` and written back
  untouched on the next save of their collection, so a bug or a newer version never silently deletes
  data.
- **Normalized.** Ids are unique, exactly one profile is default, profiles sort default first, and an
  `activeProfileId` that points nowhere falls back to the default.
- **Live.** Adapter change events (another tab, the options page, the toolbox) trigger a reload.
  Subscribers are notified only when data actually changed, with the changed collections, whether
  the change was local or external, and whether the active profile changed. The controller re-emits
  these as `data:changed` and `profile:changed` events.

## Migrations

`meta.schemaVersion` records the data version (currently 1). On load the store runs every
`DATA_MIGRATIONS` step above the stored version, in order, against the raw documents, and writes the
result **in one `setMany`**, `meta` included. If a step throws, nothing is written and the store
reports `status: 'error'`.

- Version 1 creates the collections and the blank "General" profile.
- Data written by a newer version (`schemaVersion` above the latest known) is left untouched and the
  store opens in an error state with `reason: 'newer-schema'`, so an older build cannot damage it.
- A gap in the migration list, or a corrupt `meta` document, is reported instead of guessed.

To add version 2: append `{ version: 2, description, migrate(data, ctx) }` that returns the new raw
documents, bump nothing else, and add a test that loads version-1 data.

## Import and export

An export file is JSON:

```json
{
  "format": "universal-form-autofill/export",
  "version": 1,
  "exportedAt": 1767225600000,
  "profiles": [],
  "answers": [],
  "customFields": [],
  "mappings": [],
  "settings": {}
}
```

`settings` is optional (the export dialog lets the user leave it out), and exports can be limited to
some profiles (`profileIds`), in which case only their answers plus global answers are included.

Import is two steps, both pure until the user confirms:

1. **Parse** (`parseImport`): rejects files over 10 million characters, invalid JSON, other formats,
   and newer versions, and reports up to five schema problems with their paths. Unknown properties
   are dropped.
2. **Plan** (`planImport`, shown as a preview): counts what would be added, updated and skipped.
   - **Merge** keeps current data. Profiles match by id, then by name; custom fields by key; answers
     by id or as exact duplicates. The newer `updatedAt` wins.
   - **Replace** deletes current profiles, answers, custom fields and mappings first. It keeps a
     "General" profile if the file has none.
   - Settings are applied only when the user opts in, with warnings when they enable synthetic data,
     trusted sites or overwriting.
   - Answers for missing profiles, and answers or custom fields that look like secrets, are skipped
     and counted in the preview.

The import is then written with the same atomic batch as migrations.

## Adapters

| Adapter                    | Use                                     | Atomic batch      | Change events              |
| -------------------------- | --------------------------------------- | ----------------- | -------------------------- |
| `createMemoryStorage`      | Tests, previews, hosts without storage  | Yes               | Same instance              |
| `createStorageAreaAdapter` | `chrome.storage.local/sync/session`     | Yes (one `set`)   | Cross-context `onChanged`  |
| `createIndexedDbStorage`   | Web pages and hosts without extensions  | Yes (transaction) | Cross-tab BroadcastChannel |
| `createHostStorage`        | Any host backend (`get`/`set`/`remove`) | When `setMany`    | When `subscribe` is given  |

Every adapter namespaces its keys, clones values in both directions, reports failures as
`STORAGE_ERROR`, and declares its `capabilities` so the store and hosts know what to expect.
`createHostStorage` keeps a key index of its own when the backend cannot list keys.

## Deleting data

`store.deleteAll()` removes every key the store owns and runs the first-run migration again, leaving
one blank "General" profile and default settings. Removing a profile deletes its own answers and
mappings (the confirmation dialog shows how many); global answers are never touched by profile
operations.

## Known limitations

- Writes are serialized within one page. Two pages saving at the same moment re-read before writing,
  but there is no cross-page lock, so a simultaneous edit to the same collection can lose one side.
  This is rare in practice (the user edits in one place at a time).
- A host adapter without `setMany` writes collections one by one, so a crash mid-migration can leave
  part of a batch written. `meta` is written last, so the next start re-runs the migration.
