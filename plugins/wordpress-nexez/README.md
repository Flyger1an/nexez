# Nexez Agent-Ready - WordPress plugin

Makes a WordPress site legible and transactable to AI shopping agents by
connecting it to the site owner's [Nexez](https://nexez.ai) listing. It is a thin
server-side delivery vehicle over the Nexez **embed manifest**. It fetches public
data, validates it, and constructs all WordPress output locally.

## What it does

Given a listing slug, on every front-end request the plugin:

1. **Adds JSON-LD and a manifest `<link>` to `<head>`** (hook `wp_head`). Public
   listing data comes from `https://nexez.app/<slug>/embed.json` and is cached for
   1 hour. The plugin validates the JSON, encodes it with WordPress, and builds
   the markup locally, so remote HTML is never printed into the site.
2. **301-redirects the agent artifact paths** (hook `template_redirect`, exact-path
   match, GET/HEAD only) - `/.well-known/agent.json`, `/agent.json`, `/llms.txt`,
   `/openapi.json`, and `/mcp.json` (when the listing enables MCP) - to the live
   Nexez listing artifacts. Uses the manifest's `redirects` map, with a hardcoded
   fallback if the API is briefly unreachable.
3. **Serves `/.well-known/nexez-verify.txt`** with the owner's verification token so
   the site can be verified on Nexez via the file method (no DNS change).

The only external host contacted is `nexez.app`. The request sends the configured
public listing slug, the server IP inherent to the connection, and the plugin's
site-neutral User-Agent. The WordPress.org `readme.txt` contains the complete
external-service disclosure and legal links.

## Why a plugin (and not just the `<script>` embed)

AI agents read the **server** HTML response, not client JavaScript. A `<script>`
tag can't emit server-rendered JSON-LD, can't create files at `/.well-known/*`, and
can't set redirects. Those all require running in the site's own stack - which is
exactly what this plugin does. It is the WordPress packaging of the Phase-2
"live external-domain artifacts" foundation.

## Install / test locally

- Copy this directory into `wp-content/plugins/nexez-agent-ready/` and activate.
- Settings > **Nexez Agent-Ready** > paste a real published listing slug > Save.
- Verify:
  - `view-source:` on any page shows the `<script type="application/ld+json">` block.
  - `curl -sI https://<site>/.well-known/agent.json` returns `301` to `https://nexez.app/<slug>/agent.json`.
  - `curl -s https://<site>/.well-known/nexez-verify.txt` returns the token (if set).

## Files

- `nexez-agent-ready.php` - the whole plugin (single file).
- `uninstall.php` - removes options + cached transients on uninstall.
- `readme.txt` - WordPress.org directory readme.

Publishing to the WordPress plugin directory is a manual owner action.
