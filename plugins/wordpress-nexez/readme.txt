=== Nexez Agent-Ready ===
Contributors: nexezdev
Tags: ai, agents, structured-data, json-ld, ecommerce
Requires at least: 5.5
Tested up to: 7.1
Requires PHP: 7.2
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connect your Nexez listing to WordPress with live structured data and agent-ready discovery files.

== Description ==

AI shopping agents read structured data on your server, not your design. **Nexez Agent-Ready** connects your WordPress site to your [Nexez](https://nexez.app/) listing so agents can understand and transact with your offers, with nothing to maintain.

Paste your Nexez listing slug and the plugin will:

* Inject your listing's **JSON-LD** (schema.org offers) and a manifest `<link>` into every page `<head>`, server-side, so agents that read your HTML see your offers.
* **301-redirect** the agent artifact paths on your domain (`/.well-known/agent.json`, `/agent.json`, `/llms.txt`, `/openapi.json`, and `/mcp.json` when enabled) to your **live** Nexez listing, so an agent probing `yoursite.com/.well-known/agent.json` always gets your current offers.
* Serve the **file ownership proof** (`/.well-known/nexez-verify.txt`) so you can verify your site on Nexez without editing DNS.

Everything reflects your live Nexez listing. The plugin validates the public JSON response, encodes the JSON-LD locally, and constructs the manifest link locally. It never prints remote HTML into your site.

**Privacy / network:** this plugin depends on the external Nexez service at https://nexez.app/. After an administrator saves a listing slug, the plugin makes a server-side request to `https://nexez.app/<your-slug>/embed.json` when its local cache is empty or expired. Full details, including the data sent and legal links, appear in the **External services** section below.

== Installation ==

1. Install and activate the plugin.
2. Get your listing slug from your Nexez listing URL: `https://nexez.app/<slug>`.
3. Go to **Settings > Nexez Agent-Ready**, paste the slug, and save.
4. (Optional) To verify site ownership on Nexez, paste the verification token from **Nexez > Settings > Your website**, then run "Verify (file)" on Nexez.

== Frequently Asked Questions ==

= Do I need a Nexez account? =
Yes. Create a free listing at https://nexez.app/. The plugin connects this site to that listing.

= Will this change my theme or content? =
No. It only adds structured data to your `<head>` and redirects a handful of machine-readable artifact paths.

= What if I already have an /llms.txt file? =
Your existing file is served by your web server and is left untouched. The plugin only handles artifact paths that would otherwise 404.

== External services ==

This plugin depends on **Nexez**, an external software service that hosts merchant listings and their public agent-discovery artifacts.

* **Service website:** [Nexez](https://nexez.app/)
* **When a request is made:** after an administrator saves a Nexez listing slug, the plugin sends a server-side GET request to `https://nexez.app/<your-slug>/embed.json` when the one-hour local cache is empty or expired. This can occur while a public page is rendered, while one of the supported agent-artifact paths is requested, or while the plugin settings page checks the connection. A failed request is cached for five minutes. Saving the settings clears the cache.
* **Data sent:** the configured public listing slug appears in the request URL. The request also necessarily exposes the WordPress server's IP address and sends the User-Agent `Nexez-Agent-Ready/<version>; WordPress`. The plugin does not include the WordPress site URL, page content, administrator details, visitor details, cookies, form values, or analytics data.
* **Why it is sent:** Nexez uses the slug to return that listing's public structured data, artifact URLs, and redirect map. The plugin needs this response to add JSON-LD and discovery links and to route the supported agent-artifact paths.
* **Data received:** the configured listing's public name, structured data, artifact URLs, and redirect rules. The plugin validates this data and constructs all WordPress output locally.
* **No browser requests or tracking:** requests originate from the WordPress server. The plugin does not make Nexez requests from visitors' browsers and does not send analytics or telemetry.
* **Administrator choice:** saving a listing slug is the action that connects the site to Nexez and enables these requests. Clearing the slug disables them.
* **Terms of service:** [Nexez Terms of Service](https://nexez.ai/terms)
* **Privacy policy:** [Nexez Privacy Policy](https://nexez.ai/privacy)

== Screenshots ==

1. Settings screen: paste your Nexez listing slug and optional verification token.
2. The injected JSON-LD and manifest link as agents see them in your page head.

== Upgrade Notice ==

= 1.0.0 =
Initial release.

== Changelog ==

= 1.0.0 =
* Initial release: locally encoded JSON-LD, live artifact redirects, and file-method verification.
* Document the Nexez external service, request data, timing, purpose, terms, and privacy policy.
* Validate structured responses and construct all WordPress markup locally.
