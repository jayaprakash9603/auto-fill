# Permissions (standalone extension)

The Chrome extension (`apps/chrome-extension`) requests:

| Permission | Why |
|------------|-----|
| `sidePanel` | Primary UI surface |
| `storage` | Profiles and answers |
| `activeTab` | Read the current tab when the user opens the panel |
| `scripting` | Inject the page runtime on user-granted origins |

**Optional host permissions** (`http://*/*`, `https://*/*`) are requested only when the user allows access to a site. The E2E build uses fixed `127.0.0.1` host permissions instead.

The extension does **not** request `<all_urls>` at install time. It never submits forms or bypasses captchas.

Embedded hosts (Browser Toolbox, demo host) declare their own manifest entries and should follow the same minimal set.
