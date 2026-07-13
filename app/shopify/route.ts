import { shopifyApiKey, shopifyConfigured } from '../../lib/server/shopify'

export const dynamic = 'force-dynamic'

function shell(apiKey: string) {
  const safeApiKey = apiKey.replace(/[^A-Za-z0-9_-]/g, '')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="shopify-api-key" content="${safeApiKey}">
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
  <title>Nexez Agent-Ready</title>
  <style>
    :root { color-scheme: light; --ink:#202223; --muted:#616a75; --line:#dfe3e8; --surface:#fff; --soft:#f6f6f7; --accent:#008060; --accent-hover:#006e52; --danger:#b42318; --warning:#8a6116; }
    * { box-sizing:border-box; }
    body { margin:0; background:#f1f2f4; color:var(--ink); font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; letter-spacing:0; }
    button,a { font:inherit; }
    button:focus-visible,a:focus-visible { outline:2px solid #005bd3; outline-offset:2px; }
    .wrap { width:min(100%,980px); margin:0 auto; padding:32px 24px 56px; }
    .head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:24px; }
    .brand { margin:0 0 4px; font-size:22px; line-height:1.25; font-weight:650; }
    .sub { margin:0; color:var(--muted); }
    .status { display:inline-flex; align-items:center; min-height:28px; padding:4px 10px; border:1px solid #b7e4d7; border-radius:999px; background:#eaf7f2; color:#005c45; font-size:12px; font-weight:650; white-space:nowrap; }
    .panel { border:1px solid var(--line); border-radius:8px; background:var(--surface); box-shadow:0 1px 2px rgba(0,0,0,.05); }
    .hero { padding:24px; }
    .hero h1 { margin:0 0 8px; font-size:20px; line-height:1.35; font-weight:650; }
    .hero p { max-width:680px; margin:0; color:var(--muted); }
    .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
    .btn { display:inline-flex; min-height:40px; align-items:center; justify-content:center; gap:8px; border:1px solid #babfc3; border-radius:7px; background:#fff; color:var(--ink); padding:8px 14px; text-decoration:none; font-weight:600; cursor:pointer; transition:background .15s,border-color .15s,transform .15s; }
    .btn:hover { background:#f6f6f7; border-color:#8c9196; }
    .btn:active { transform:translateY(1px); }
    .btn.primary { border-color:var(--accent); background:var(--accent); color:#fff; }
    .btn.primary:hover { border-color:var(--accent-hover); background:var(--accent-hover); }
    .btn:disabled { cursor:not-allowed; opacity:.58; transform:none; }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin-top:20px; border-top:1px solid var(--line); }
    .step { min-width:0; padding:20px 22px; border-right:1px solid var(--line); }
    .step:last-child { border-right:0; }
    .step-label { margin:0 0 6px; color:var(--muted); font-size:12px; font-weight:650; text-transform:uppercase; }
    .step h2 { margin:0 0 7px; font-size:15px; font-weight:650; }
    .step p { margin:0; color:var(--muted); overflow-wrap:anywhere; }
    .step .actions { margin-top:16px; }
    .notice { margin-top:16px; padding:12px 14px; border:1px solid var(--line); border-radius:7px; background:var(--soft); color:var(--muted); }
    .notice.error { border-color:#f3b6b2; background:#fff0ef; color:var(--danger); }
    .notice.warning { border-color:#e8cf91; background:#fff8e6; color:var(--warning); }
    .meta { margin-top:20px; display:flex; flex-wrap:wrap; gap:10px 20px; color:var(--muted); font-size:12px; }
    .meta a { color:inherit; }
    .skeleton { height:14px; margin:10px 0; border-radius:4px; background:#eceff1; animation:pulse 1.4s ease-in-out infinite; }
    .skeleton.short { width:48%; }
    @keyframes pulse { 50% { opacity:.45; } }
    @media (max-width:720px) { .wrap{padding:22px 16px 40px}.head{align-items:flex-start}.grid{grid-template-columns:1fr}.step{border-right:0;border-bottom:1px solid var(--line)}.step:last-child{border-bottom:0}.actions .btn{width:100%} }
    @media (prefers-reduced-motion:reduce) { * { animation:none!important; transition:none!important; } }
  </style>
</head>
<body>
  <main class="wrap">
    <header class="head">
      <div><p class="brand">Nexez Agent-Ready</p><p class="sub" id="shop-label">Opening your store connection</p></div>
      <span class="status" id="app-status">Checking</span>
    </header>
    <section class="panel" aria-live="polite" id="app">
      <div class="hero"><div class="skeleton short"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    </section>
    <footer class="meta"><span>Catalog access is read-only.</span><a href="https://nexez.ai/privacy" target="_blank" rel="noreferrer">Privacy</a><a href="https://nexez.ai/support" target="_blank" rel="noreferrer">Support</a></footer>
  </main>
  <script>
    (() => {
      const app = document.getElementById('app');
      const appStatus = document.getElementById('app-status');
      const shopLabel = document.getElementById('shop-label');
      let context = null;

      const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
      const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : 'Not synced yet';
      const openExternal = (url) => window.open(url, '_blank', 'noopener,noreferrer');
      const openTopLevel = (url) => window.open(url, '_top');

      function renderError(message) {
        appStatus.textContent = 'Needs attention';
        appStatus.style.background = '#fff0ef';
        appStatus.style.borderColor = '#f3b6b2';
        appStatus.style.color = '#8e1f17';
        app.innerHTML = '<div class="hero"><h1>We could not open this connection</h1><p>'+escapeHtml(message)+'</p><div class="actions"><button class="btn primary" id="retry">Try again</button></div></div>';
        document.getElementById('retry').addEventListener('click', load);
      }

      function renderLink(data) {
        appStatus.textContent = 'Account link needed';
        shopLabel.textContent = data.shop;
        app.innerHTML = '<div class="hero"><h1>Connect this store to Nexez</h1><p>Continue to choose the Nexez listing that should receive this Shopify catalog. You will leave Shopify briefly to complete the secure account link.</p><div class="actions"><button class="btn primary" id="connect">Continue to Nexez</button></div><div class="notice">Nexez reads your active products and publishes agent-readable discovery links. Checkout stays on your Shopify store.</div></div>';
        document.getElementById('connect').addEventListener('click', () => openTopLevel(data.connectUrl));
      }

      function renderLinked(data) {
        const listingName = data.listing?.name || data.listing?.slug || 'Connected listing';
        const sync = data.sync || {};
        appStatus.textContent = sync.error ? 'Needs attention' : sync.pending ? 'Sync queued' : 'Connected';
        shopLabel.textContent = data.shop;
        app.innerHTML = '<div class="hero"><h1>'+escapeHtml(listingName)+'</h1><p>Your Shopify catalog is linked to Nexez. Keep the catalog current, enable storefront discovery, and inspect the same endpoint AI agents receive.</p>'+(sync.error?'<div class="notice warning" id="sync-notice">'+escapeHtml(sync.error)+'</div>':'<div class="notice" id="sync-notice">Last catalog sync: '+escapeHtml(formatDate(sync.lastSyncedAt))+'</div>')+'</div><div class="grid"><section class="step"><p class="step-label">Catalog</p><h2>Keep offers current</h2><p>Active product details, prices, variants, and availability sync into the linked listing.</p><div class="actions"><button class="btn" id="sync">Sync now</button></div></section><section class="step"><p class="step-label">Storefront</p><h2>Enable discovery links</h2><p>Activate the theme app embed so agents can find the manifest from your storefront.</p><div class="actions"><button class="btn" id="theme">Open theme editor</button></div></section><section class="step"><p class="step-label">Agent endpoint</p><h2>Inspect the live artifact</h2><p>'+escapeHtml(data.storefrontArtifactUrl)+'</p><div class="actions"><button class="btn" id="artifact">Open endpoint</button></div></section></div>';
        document.getElementById('theme').addEventListener('click', () => openExternal(data.themeEditorUrl));
        document.getElementById('artifact').addEventListener('click', () => openExternal(data.storefrontArtifactUrl));
        document.getElementById('sync').addEventListener('click', syncNow);
      }

      async function syncNow() {
        const button = document.getElementById('sync');
        const notice = document.getElementById('sync-notice');
        button.disabled = true;
        button.textContent = 'Syncing';
        try {
          const response = await fetch('/api/shopify/session/sync', { method:'POST' });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Catalog sync could not finish.');
          notice.className = 'notice';
          notice.textContent = 'Catalog synced. '+Number(data.imported || 0)+' active products imported.';
          button.textContent = 'Synced';
          setTimeout(load, 900);
        } catch (error) {
          notice.className = 'notice error';
          notice.textContent = error instanceof Error ? error.message : 'Catalog sync could not finish.';
          button.disabled = false;
          button.textContent = 'Try sync again';
        }
      }

      async function load() {
        appStatus.textContent = 'Checking';
        try {
          const response = await fetch('/api/shopify/session', { method:'POST' });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Shopify could not authenticate this app session.');
          context = data;
          if (data.state === 'linked') renderLinked(data); else renderLink(data);
        } catch (error) {
          renderError(error instanceof Error ? error.message : 'Try reopening the app from Shopify admin.');
        }
      }

      load();
    })();
  </script>
</body>
</html>`
}

export async function GET() {
  if (!shopifyConfigured()) {
    return Response.json({ error: 'Shopify app is not configured.' }, { status: 404 })
  }
  return new Response(shell(shopifyApiKey()), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.shopify.com; style-src 'unsafe-inline'; connect-src 'self' https://*.shopify.com; img-src 'self' data:; frame-ancestors https://admin.shopify.com https://*.myshopify.com",
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
    },
  })
}
