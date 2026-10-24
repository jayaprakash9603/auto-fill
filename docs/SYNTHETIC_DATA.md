# Synthetic data

Synthetic generation helps you **preview** how a form behaves without using real personal data. It is **off by default** and values are **never written to storage**.

## Safety defaults

- Toggle **Allow synthetic data** in Filling settings before **Generate preview** appears.
- Generated values are tagged `source: generated` in the controller and shown with a **Generated preview** badge in the panel.
- Policies treat generated values like saved answers for display, but learning and import/export never persist them.
- Reserved test patterns: `@example.com` email addresses and fictional `555-01xx` phone numbers (see built-in generators).

## Allowlists

Settings control:

- **allowedCategories** — which generator categories may run (defaults to the full catalog when enabled).
- **fieldAllowlist** — optional normalized field labels that may receive synthetic values.
- **seed** — optional string for deterministic PRNG output while testing.

## Workflow

1. Enable synthetic data in settings.
2. Select fields on the **Page** tab.
3. Click **Generate preview** — results stay in memory until you fill, clear, rescan, or disconnect.
4. **Fill selected** uses generated values when present for those fields.

## Clearing

**Clear selected** empties chosen fields after confirmation. A snapshot is taken when possible so **Undo fill** restores prior values, the same as after a fill.

Consent, password, file, and unsupported controls are never cleared unless policy explicitly allows selection (consent requires you to select the field yourself).
