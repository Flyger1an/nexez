# WordPress.org Plugin Directory Submission - Owner Checklist

Goal: list **Nexez Agent-Ready** (`plugins/wordpress-nexez/`) in the wordpress.org
directory. Besides distribution, the listing earns a high-authority backlink to
nexez.ai (SEO audit P2 item).

The first review requested a clearer external-service disclosure and removal of
raw remote HTML output. This checklist covers the corrected upload and reply.

## 1. Pre-submission (30-60 min)

- [ ] **Test on the current WordPress release** (spin up a fresh WP 7.1 install,
      install the plugin from a zip, exercise: settings save, JSON-LD appears in
      head, artifact 301s, verify-file, API failure, and hostile API payload).
      `readme.txt` claims `Tested up to: 7.1` only after this gate passes.
- [ ] **Check the slug is free**: visit `https://wordpress.org/plugins/nexez-agent-ready/`
      (should 404). The directory assigns the slug from the plugin at review time
      and it is permanent.
- [ ] **Build the zip** with one top-level `nexez-agent-ready/` directory
      containing exactly `nexez-agent-ready.php`, `readme.txt`, and
      `uninstall.php` (no README.md, tests, or dotfiles). Inspect the archive
      with `unzip -l` before uploading it.
- [ ] Run the official **Plugin Check (PCP)** plugin against the installed ZIP,
      including runtime checks, and save the result with the release evidence.
- [ ] Run PHP syntax checks on PHP 7.2 and the current supported PHP release.
- [ ] Run WordPress Coding Standards and inspect every output, input, remote
      request, redirect, capability check, option, transient, and uninstall path.

## 2. Submit

- [ ] Log in / register at wordpress.org (use support@nexez.ai so the listing
      isn't tied to a personal account).
- [ ] Upload the corrected zip in the existing submission flow.
- [ ] Reply in the existing review email thread. Suggested response:

      Thank you for the review. I uploaded a corrected ZIP. The External services
      section now identifies Nexez, explains exactly what data is sent, when and
      why it is sent, and links the service, terms, and privacy policy. The plugin
      no longer outputs remote HTML. It validates public response data, encodes
      JSON-LD with WordPress, and constructs escaped markup locally. I also ran
      Plugin Check, WordPress Coding Standards, clean-install tests with WP_DEBUG,
      and API failure and hostile-payload tests.

      Regards,
      Nexez

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
