# WordPress.org Plugin Directory Submission - Owner Checklist

Goal: list **Nexez Agent-Ready** (`plugins/wordpress-nexez/`) in the wordpress.org
directory. Besides distribution, the listing earns a high-authority backlink to
nexez.ai (SEO audit P2 item). The plugin + `readme.txt` are submission-ready,
including the review team's required **External services** disclosure.

Everything below needs YOUR account/identity - none of it is automatable.

## 1. Pre-submission (30-60 min)

- [ ] **Test on the current WordPress release** (spin up a fresh WP on latest,
      install the plugin from a zip, exercise: settings save, JSON-LD appears in
      head, artifact 301s, verify-file). Then bump `Tested up to:` in
      `readme.txt` (currently `6.6`) to the version you tested. Do NOT claim a
      version you haven't run - reviewers check.
- [ ] **Check the slug is free**: visit `https://wordpress.org/plugins/nexez-agent-ready/`
      (should 404). The directory assigns the slug from the plugin at review time
      and it is permanent.
- [ ] **Build the zip** from `plugins/wordpress-nexez/` containing exactly:
      `nexez-agent-ready.php`, `readme.txt`, `uninstall.php` (no README.md, no
      dotfiles): `cd plugins/wordpress-nexez && zip nexez-agent-ready.zip nexez-agent-ready.php readme.txt uninstall.php`
- [ ] Optional but worth it: run the official **Plugin Check (PCP)** plugin
      against it locally - the review team runs the same tool.

## 2. Submit

- [ ] Log in / register at wordpress.org (use support@nexez.ai so the listing
      isn't tied to a personal account).
- [ ] Submit the zip at `https://wordpress.org/plugins/developers/add/`.
- [ ] The review team replies by email (typically days to a few weeks). Common
      asks and our answers:
      - *External calls?* → covered by the `== External services ==` section:
        one server-side GET to the user-configured public embed.json on
        nexez.app; no visitor data, no tracking.
      - *Sanitization/escaping?* → settings are sanitized on save; all output is
        escaped at render (spot-check `nexez-agent-ready.php` if they cite lines).
      - *Trademark in slug* → "Nexez" is our own mark; be ready to confirm from
        the support@nexez.ai address.

## 3. After approval

- [ ] You get **SVN access** to `https://plugins.svn.wordpress.org/nexez-agent-ready/`.
      Commit the plugin to `trunk/`, tag `1.0.0` in `tags/`, and the listing goes
      live. (Ask me to prepare the SVN layout when you're there.)
- [ ] **Assets** (uploaded to the SVN `assets/` dir, not the plugin zip):
      - `icon-256x256.png` (+ `icon-128x128.png`)
      - `banner-1544x500.png` (+ `banner-772x250.png`)
      - `screenshot-1.png`, `screenshot-2.png` matching the readme's
        `== Screenshots ==` captions (settings screen; injected head markup).
- [ ] Add the wordpress.org listing URL to the marketing site (integrations page
      + the /scan/wordpress landing page) - tell me and I'll wire the links.

## Notes / gotchas

- The directory requires GPL-compatible licensing throughout - already satisfied
  (GPL-2.0-or-later header + readme license fields).
- Future releases: bump `Stable tag` in readme.txt + the plugin header version,
  add a changelog entry, commit + tag in SVN. The directory serves whatever
  `Stable tag` points at.
- Support forum comes with the listing (wordpress.org/support/plugin/…) - worth
  watching; unanswered threads hurt install conversion.
