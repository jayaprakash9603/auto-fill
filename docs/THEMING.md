# Theming

The panel uses the `ufa:` Tailwind prefix and CSS variables (`--ufa-*`) scoped to `.ufa-root` subtrees.

## Host integration

1. Import `@universal-form-autofill/sdk/style.css` once in your extension page or app shell.
2. Pass a theme to `AutofillPanel` or wrap with `AutofillRoot`:
   - **`cssVariableTheme()`** — map host shadcn/ui variables (Browser Toolbox and the demo host use this).
   - **`THEME_PRESETS`** — `default`, `compact`, `highContrast`.
   - **Custom `tokens`** — any key from `THEME_TOKEN_NAMES`.

## Shadow DOM

For maximum isolation from host CSS, set `shadowDom` on `AutofillRoot` and pass the compiled stylesheet text as `shadowStyles` (read `style.css` at build time or fetch once at runtime). Overlays (dialogs, menus) stay inside the shadow tree.

## Leak tests

`packages/ui/src/components/autofill-root.test.tsx` checks that aggressive host selectors do not override panel tokens and that shadow mode keeps DOM out of the light document.
