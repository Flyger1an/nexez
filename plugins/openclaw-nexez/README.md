# Nexez OpenClaw Plugin

Native OpenClaw tools for discovering Nexez agent pages, inspecting structured offers, and safely handing off checkout or negotiation intent.

Safe read tools:

- `nexez_search`
- `nexez_get_page`
- `nexez_directory`

Optional tools:

- `nexez_validate_checkout`
- `nexez_validate_negotiation`
- `nexez_start_checkout`
- `nexez_submit_negotiation`

The two real side-effecting tools require `userApproved: true` in the tool input. Agents should still ask the user for explicit approval before calling them.

## Config

```json
{
  "baseUrl": "https://nexez.app",
  "userAgent": "OpenClaw Nexez Plugin"
}
```

## Local Checks

```bash
npm test
npm install
npm run build
npm run plugin:validate
```

`npm test` is dependency-free and verifies that package metadata, manifest contracts, and source tool registrations stay aligned.
