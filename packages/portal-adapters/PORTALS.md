# Portal adapters

Built-in adapters (`@ufa/portal-adapters`):

| Id | Detection signal | Limitations |
|----|------------------|-------------|
| `workday` | `*.myworkdayjobs.com`, `data-automation-id` markers | Signed-in apply flows not covered; multi-step wizards need rescans |
| `greenhouse` | `*.greenhouse.io` + `#application_form` | Custom boards may fall back to generic |
| `lever` | `*.lever.co` + `.application-form` | Custom domains without Lever markup use generic |
| `ashby` | `*.ashbyhq.com` application forms | Custom question widgets may be unsupported |
| `generic` | Always available fallback | Native controls and shared ARIA patterns only |

Fixtures for hostname detection live in `src/registry.test.ts`. Add HTML fixtures under `fixtures/portals/` when you extend an adapter.
