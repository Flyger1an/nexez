import { NextRequest, NextResponse } from 'next/server'

/**
 * Lightweight Nexez JS Widget
 * Phase 4 / embed excellence.
 *
 * Usage (from Settings embed generator):
 * <script>
 *   (function(){var s=document.createElement('script');s.src='https://your-nexez.com/widget.js';s.onload=function(){Nexez.init({slug:'your-slug',theme:'light'})};document.head.appendChild(s);})();
 * </script>
 *
 * Renders a floating "Book via agents" button.
 * Clicking opens the clean public agent page (which respects all per-offer + page prefer_original settings, tiers, consumer fields, etc.).
 * The public page is the source of truth for agent-first consumption + human CTAs.
 *
 * Self-contained, no deps, tiny, CSP friendly.
 * Parses its own <script src> to determine the Nexez origin for building links.
 */

const WIDGET_JS = `
(function() {
  if (window.Nexez && window.Nexez._initialized) return;
  window.Nexez = window.Nexez || {};

  function getNexezOrigin() {
    try {
      // Prefer the script's own src origin (works when user pastes the exact snippet from their Nexez instance)
      const script = document.currentScript || document.querySelector('script[src*="widget.js"]') || null;
      if (script && script.src) {
        const u = new URL(script.src);
        return u.origin;
      }
    } catch (e) {}
    // Fallback: same origin as the page that loaded the widget (rarely correct if cross-site)
    return window.location.origin;
  }

  function createFloatingButton(opts) {
    var origin = getNexezOrigin();
    var publicUrl = origin + '/' + encodeURIComponent(opts.slug);

    var btn = document.createElement('button');
    btn.setAttribute('aria-label', opts.label || 'Book via agent-optimized listing');
    btn.style.position = 'fixed';
    btn.style.bottom = '24px';
    btn.style.right = '24px';
    btn.style.zIndex = '2147483647';
    btn.style.border = '0';
    btn.style.borderRadius = '9999px';
    btn.style.padding = '12px 18px';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '600';
    btn.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
    btn.style.cursor = 'pointer';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '8px';
    btn.style.transition = 'transform 120ms ease, box-shadow 120ms ease';

    var isDark = (opts.theme || 'light') === 'dark';
    if (isDark) {
      btn.style.background = '#111827';
      btn.style.color = '#F3F4F6';
      btn.style.border = '1px solid #374151';
    } else {
      btn.style.background = '#0A0A0F';
      btn.style.color = '#FFFFFF';
      btn.style.border = '1px solid rgba(255,255,255,0.1)';
    }

    var icon = document.createElement('span');
    icon.textContent = '⚡';
    icon.style.fontSize = '16px';
    btn.appendChild(icon);

    var labelEl = document.createElement('span');
    labelEl.textContent = opts.label || 'Book with AI agents';
    btn.appendChild(labelEl);

    btn.addEventListener('mouseenter', function () {
      btn.style.transform = 'translateY(-1px)';
      btn.style.boxShadow = '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.transform = 'none';
      btn.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
    });

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      // Open the public agent page - it already handles per-offer prefer_original_for_this,
      // page prefer_original_site, consumer fields, tiers, ||WINDOWS||, source badges, JSON-LD etc.
      window.open(publicUrl, '_blank', 'noopener,noreferrer');
    });

    // Keyboard accessible
    btn.setAttribute('tabindex', '0');
    btn.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        window.open(publicUrl, '_blank', 'noopener,noreferrer');
      }
    });

    document.body.appendChild(btn);

    // Small cleanup hook
    window.Nexez._cleanup = function () {
      if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    };
  }

  window.Nexez.init = function init(opts) {
    if (!opts || !opts.slug) {
      console.warn('[Nexez Widget] init() requires { slug: "..." }');
      return;
    }
    // If already initialized for this slug, skip duplicate buttons
    if (window.Nexez._initializedSlug === opts.slug) return;
    window.Nexez._initializedSlug = opts.slug;
    window.Nexez._initialized = true;

    // Defer slightly so body exists
    setTimeout(function () {
      createFloatingButton({
        slug: opts.slug,
        theme: opts.theme,
        label: opts.label,
      });
    }, 50);
  };

  // Auto-init support if data-nexez attributes present on script (advanced)
  try {
    const s = document.currentScript;
    if (s && s.dataset && s.dataset.nexezAuto) {
      const slug = s.dataset.slug || s.dataset.nexezSlug;
      if (slug) {
        window.Nexez.init({ slug, theme: s.dataset.theme || 'light' });
      }
    }
  } catch {}
})();
`.trim()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  // Future: support ?minify or version for cache-busting
  const res = new NextResponse(WIDGET_JS, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'Access-Control-Allow-Origin': '*', // safe for widget embeds
    },
  })
  return res
}
