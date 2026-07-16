=== Nexez Agent-Ready ===
Contributors: nexez
Tags: ai, agents, structured-data, json-ld, ecommerce
Requires at least: 5.5
Tested up to: 6.6
Requires PHP: 7.2
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Make your WordPress site legible and transactable to AI shopping agents. Injects your Nexez listing's structured data and serves your live agent artifacts.

== Description ==

AI shopping agents read structured data on your server, not your design. **Nexez Agent-Ready** connects your WordPress site to your [Nexez](https://nexez.ai) listing so agents can understand and transact with your offers — with nothing to maintain.

Paste your Nexez listing slug and the plugin will:

* Inject your listing's **JSON-LD** (schema.org offers) and a manifest `<link>` into every page `<head>`, server-side, so agents that read your HTML see your offers.
* **301-redirect** the agent artifact paths on your domain — `/.well-known/agent.json`, `/agent.json`, `/llms.txt`, `/openapi.json` (and `/mcp.json` when enabled) — to your **live** Nexez listing, so an agent probing `yoursite.com/.well-known/agent.json` always gets your current offers.
* Serve the **file ownership proof** (`/.well-known/nexez-verify.txt`) so you can verify your site on Nexez without editing DNS.

Everything reflects your live Nexez listing — the plugin never re-computes structured data locally, so it never goes stale when your offers change.

**Privacy / network:** the only external host this plugin ever contacts is `nexez.app`, to fetch your own listing's public embed manifest (`https://nexez.app/<your-slug>/embed.json`). No visitor data is sent anywhere.

== Installation ==

1. Install and activate the plugin.
2. Get your listing slug from your Nexez listing URL: `https://nexez.app/<slug>`.
3. Go to **Settings → Nexez Agent-Ready**, paste the slug, and save.
4. (Optional) To verify site ownership on Nexez, paste the verification token from **Nexez → Settings → Your website**, then run "Verify (file)" on Nexez.

== Frequently Asked Questions ==

= Do I need a Nexez account? =
Yes — create a free listing at https://nexez.ai. The plugin connects this site to that listing.

= Will this change my theme or content? =
No. It only adds structured data to your `<head>` and redirects a handful of machine-readable artifact paths.

= What if I already have an /llms.txt file? =
Your existing file is served by your web server and is left untouched — the plugin only handles artifact paths that would otherwise 404.

== External services ==

This plugin connects to **Nexez** (nexez.app), the service that hosts your listing's public agent artifacts.

* **What is sent and when:** the only request the plugin ever makes is a server-side GET to `https://nexez.app/<your-slug>/embed.json` — the public embed manifest of the listing slug *you* configured — to fetch your listing's JSON-LD and manifest link. It is fetched when the cached copy expires. The request contains no visitor data, no admin data, and no site content; only the slug you entered determines the URL.
* **What is received:** your own listing's public structured data (the same JSON anyone can fetch from that URL).
* **No tracking:** the plugin sends no analytics, telemetry, or personal data anywhere, and makes no requests from your visitors' browsers.
* **Service provider:** Nexez — [terms of service](https://nexez.ai/terms), [privacy policy](https://nexez.ai/privacy).

== Screenshots ==

1. Settings screen: paste your Nexez listing slug and optional verification token.
2. The injected JSON-LD and manifest link as agents see them in your page head.

== Upgrade Notice ==

= 1.0.0 =
Initial release.

== Changelog ==

= 1.0.0 =
* Initial release: JSON-LD injection, live artifact redirects, and file-method verification.
