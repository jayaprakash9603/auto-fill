# Privacy

Universal Form Autofill is **local-first**:

- Profiles, answers, and settings stay in the browser (IndexedDB / `chrome.storage` / a host adapter you provide).
- The engine does not send form contents or saved answers to a remote server as part of normal operation.
- Learning and synthetic preview values exist only in memory until you explicitly save an answer.
- Generated synthetic values are never persisted.
- Fill, clear, and undo operate on the active tab through an injected page runtime you control.

Grant **site access** only when you want the extension to read a form on that origin. Revoke access in the browser’s extension permissions UI at any time.

Export files contain your personal data; treat them like any sensitive backup.
