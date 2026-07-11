<?php
/**
 * Plugin Name:       Nexez Agent-Ready
 * Plugin URI:        https://nexez.ai/scan
 * Description:        Make your WordPress site legible and transactable to AI shopping agents. Injects your Nexez listing's structured data (JSON-LD) and serves your live agent artifacts (/.well-known/agent.json, /llms.txt, …) — no server config, always up to date.
 * Version:           1.0.0
 * Requires at least: 5.5
 * Requires PHP:      7.2
 * Author:            Nexez
 * Author URI:        https://nexez.ai
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       nexez-agent-ready
 *
 * How it works: you paste your Nexez listing slug (from your listing URL,
 * https://nexez.app/<slug>) into the settings. The plugin then FETCHES the
 * ready-to-inject artifacts from https://nexez.app/<slug>/embed.json and:
 *   - injects your server-rendered JSON-LD + manifest <link> into <head>
 *     (so agents that read your HTML see your offers), and
 *   - 301-redirects the agent artifact paths on your domain to your live
 *     Nexez listing (so an agent probing yoursite.com/.well-known/agent.json
 *     gets your current offers — nothing to maintain, never goes stale).
 *
 * The plugin never re-computes any structured data locally; it always reflects
 * your live Nexez listing. The only network host it ever contacts is nexez.app.
 */

if (!defined('ABSPATH')) {
	exit; // No direct access.
}

define('NEXEZ_AGENT_READY_VERSION', '1.0.0');
define('NEXEZ_AGENT_READY_HOST', 'https://nexez.app');
define('NEXEZ_AGENT_READY_OPTION', 'nexez_agent_ready_options');

/**
 * Merged plugin options with defaults.
 *
 * @return array{slug:string,token:string}
 */
function nexez_agent_ready_options() {
	$opts = get_option(NEXEZ_AGENT_READY_OPTION, array());
	if (!is_array($opts)) {
		$opts = array();
	}
	return wp_parse_args($opts, array('slug' => '', 'token' => ''));
}

/**
 * A URL is safe to redirect to only if it points at the pinned Nexez host — so a
 * redirect target can never send visitors off to an arbitrary origin, whatever the
 * embed response contains.
 *
 * @param mixed $url
 * @return bool
 */
function nexez_agent_ready_is_trusted_url($url) {
	return is_string($url) && 0 === strpos($url, NEXEZ_AGENT_READY_HOST . '/');
}

/**
 * Fetch + cache the listing's embed manifest from Nexez (host-pinned to nexez.app).
 * Returns array() on any failure (brief negative cache so a down API doesn't hammer).
 *
 * @param string $slug Validated listing slug.
 * @return array
 */
function nexez_agent_ready_get_embed($slug) {
	if (!$slug) {
		return array();
	}
	$key = 'nexez_embed_' . md5($slug);
	$cached = get_transient($key);
	if (is_array($cached)) {
		return $cached;
	}

	$url = NEXEZ_AGENT_READY_HOST . '/' . rawurlencode($slug) . '/embed.json';
	$res = wp_remote_get($url, array(
		'timeout' => 5,
		'headers' => array('Accept' => 'application/json'),
	));

	if (is_wp_error($res) || 200 !== (int) wp_remote_retrieve_response_code($res)) {
		set_transient($key, array(), 5 * MINUTE_IN_SECONDS);
		return array();
	}

	$data = json_decode(wp_remote_retrieve_body($res), true);
	if (!is_array($data) || empty($data['ok'])) {
		set_transient($key, array(), 5 * MINUTE_IN_SECONDS);
		return array();
	}

	set_transient($key, $data, HOUR_IN_SECONDS);
	return $data;
}

/**
 * Inject the listing's JSON-LD + manifest link (+ verification meta) into <head>.
 * The JSON-LD/link are trusted, host-pinned HTML from the Nexez API and must be
 * emitted verbatim (escaping would break the <script> tag); we sanity-check the
 * expected prefixes before echoing.
 */
function nexez_agent_ready_wp_head() {
	$opts = nexez_agent_ready_options();
	if ('' === $opts['slug']) {
		return;
	}

	$data = nexez_agent_ready_get_embed($opts['slug']);

	if (!empty($data['jsonld']) && is_string($data['jsonld'])
		&& 0 === strpos($data['jsonld'], '<script type="application/ld+json">')
		&& '</script>' === substr($data['jsonld'], -9)) {
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted host-pinned Nexez JSON-LD; must be raw.
		echo "\n" . $data['jsonld'] . "\n";
	}

	if (!empty($data['headLink']) && is_string($data['headLink'])
		&& 0 === strpos($data['headLink'], '<link ')
		&& '>' === substr($data['headLink'], -1)
		&& false === strpos($data['headLink'], '<script')) {
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted host-pinned Nexez <link> tag; must be raw.
		echo $data['headLink'] . "\n";
	}

	if ('' !== $opts['token']) {
		echo '<meta name="nexez-site-verification" content="' . esc_attr($opts['token']) . '">' . "\n";
	}
}
add_action('wp_head', 'nexez_agent_ready_wp_head', 5);

/**
 * Serve the agent artifacts on THIS domain by 301-redirecting them to the live
 * Nexez listing, and serve the file-verification token. Runs early on front-end
 * GET/HEAD requests only, matches EXACT paths, and no-ops otherwise. Because WP
 * only handles a request when the web server found no matching static file, an
 * existing real /llms.txt on the site is served by the server and never reaches
 * this hook.
 */
function nexez_agent_ready_intercept() {
	if (is_admin()) {
		return;
	}
	$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper(sanitize_text_field(wp_unslash($_SERVER['REQUEST_METHOD']))) : 'GET';
	if ('GET' !== $method && 'HEAD' !== $method) {
		return;
	}

	$opts = nexez_agent_ready_options();
	if ('' === $opts['slug']) {
		return;
	}

	$uri  = isset($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '';
	$path = strtok($uri, '?');
	if (!is_string($path) || '' === $path) {
		return;
	}
	// Normalize a trailing slash but keep the exact path otherwise.
	if ('/' !== $path) {
		$path = rtrim($path, '/');
	}

	// The file-verification proof (Nexez Settings → "Verify (file)" fetches this).
	if ('/.well-known/nexez-verify.txt' === $path && '' !== $opts['token']) {
		header('Content-Type: text/plain; charset=utf-8');
		header('X-Robots-Tag: noindex');
		echo esc_html($opts['token']);
		exit;
	}

	$candidates = array('/.well-known/agent.json', '/agent.json', '/llms.txt', '/openapi.json', '/mcp.json');
	if (!in_array($path, $candidates, true)) {
		return;
	}

	// Prefer the live redirect map from the cached embed manifest (it reflects
	// whether MCP is enabled); fall back to the always-present artifacts if the
	// API is unreachable.
	$data = nexez_agent_ready_get_embed($opts['slug']);
	if (!empty($data['redirects']) && is_array($data['redirects'])) {
		foreach ($data['redirects'] as $rule) {
			if (isset($rule['from'], $rule['to']) && $rule['from'] === $path
				&& nexez_agent_ready_is_trusted_url($rule['to'])) {
				wp_redirect(esc_url_raw($rule['to']), 301);
				exit;
			}
		}
	}

	$listing  = NEXEZ_AGENT_READY_HOST . '/' . rawurlencode($opts['slug']);
	$fallback = array(
		'/.well-known/agent.json' => '/agent.json',
		'/agent.json'             => '/agent.json',
		'/llms.txt'               => '/llms.txt',
		'/openapi.json'           => '/openapi.json',
	);
	if (isset($fallback[$path])) {
		wp_redirect(esc_url_raw($listing . $fallback[$path]), 301);
		exit;
	}
}
add_action('template_redirect', 'nexez_agent_ready_intercept', 0);

/* -------------------------------------------------------------------------- */
/* Admin settings                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Validate + normalize submitted settings. Accepts a pasted slug OR a full
 * listing URL (extracts the last path segment). Clears the embed cache on change.
 *
 * @param array $input Raw form input.
 * @return array{slug:string,token:string}
 */
function nexez_agent_ready_sanitize($input) {
	$slug = isset($input['slug']) ? strtolower(trim((string) $input['slug'])) : '';
	if (false !== strpos($slug, '/')) {
		$slug = preg_replace('#^https?://#', '', $slug);
		$parts = array_values(array_filter(explode('/', $slug)));
		// Drop a leading host segment like "nexez.app".
		$slug = !empty($parts) ? end($parts) : '';
	}
	if (!preg_match('/^[a-z0-9-]{1,80}$/', (string) $slug)) {
		$slug = '';
	}

	$token = isset($input['token']) ? trim((string) $input['token']) : '';
	if ('' !== $token && !preg_match('/^nexez-site-verify-[0-9a-f]{16,64}$/', $token)) {
		add_settings_error('nexez_agent_ready', 'bad_token', __('That verification token doesn’t look right — copy it exactly from Nexez Settings.', 'nexez-agent-ready'));
		$token = '';
	}

	if ($slug) {
		delete_transient('nexez_embed_' . md5($slug));
	}

	return array('slug' => $slug, 'token' => $token);
}

function nexez_agent_ready_register_settings() {
	register_setting('nexez_agent_ready', NEXEZ_AGENT_READY_OPTION, array(
		'type'              => 'array',
		'sanitize_callback' => 'nexez_agent_ready_sanitize',
		'default'           => array('slug' => '', 'token' => ''),
	));
}
add_action('admin_init', 'nexez_agent_ready_register_settings');

function nexez_agent_ready_add_menu() {
	add_options_page(
		__('Nexez Agent-Ready', 'nexez-agent-ready'),
		__('Nexez Agent-Ready', 'nexez-agent-ready'),
		'manage_options',
		'nexez-agent-ready',
		'nexez_agent_ready_render_settings'
	);
}
add_action('admin_menu', 'nexez_agent_ready_add_menu');

function nexez_agent_ready_render_settings() {
	if (!current_user_can('manage_options')) {
		return;
	}
	$opts = nexez_agent_ready_options();
	$data = $opts['slug'] ? nexez_agent_ready_get_embed($opts['slug']) : array();
	?>
	<div class="wrap">
		<h1><?php echo esc_html__('Nexez Agent-Ready', 'nexez-agent-ready'); ?></h1>
		<p><?php echo esc_html__('Make this site legible and transactable to AI agents. Paste your Nexez listing slug below — the plugin injects your structured data and serves your live agent artifacts automatically.', 'nexez-agent-ready'); ?></p>

		<?php if ($opts['slug']) : ?>
			<?php if (!empty($data['ok'])) : ?>
				<div class="notice notice-success inline"><p>
					<?php
					/* translators: %s: the connected Nexez listing name. */
					echo esc_html(sprintf(__('Connected to “%s”. Your JSON-LD and artifacts are live.', 'nexez-agent-ready'), isset($data['name']) ? (string) $data['name'] : $opts['slug']));
					?>
				</p></div>
			<?php else : ?>
				<div class="notice notice-warning inline"><p>
					<?php echo esc_html__('Could not reach that listing on Nexez yet. Double-check the slug, and make sure the listing is published.', 'nexez-agent-ready'); ?>
				</p></div>
			<?php endif; ?>
		<?php endif; ?>

		<form action="options.php" method="post">
			<?php settings_fields('nexez_agent_ready'); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="nexez-slug"><?php echo esc_html__('Listing slug', 'nexez-agent-ready'); ?></label></th>
					<td>
						<input name="<?php echo esc_attr(NEXEZ_AGENT_READY_OPTION); ?>[slug]" id="nexez-slug" type="text" class="regular-text" value="<?php echo esc_attr($opts['slug']); ?>" placeholder="your-listing-slug" />
						<p class="description"><?php echo esc_html__('From your listing URL: https://nexez.app/<slug>. You can paste the full URL too.', 'nexez-agent-ready'); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="nexez-token"><?php echo esc_html__('Verification token', 'nexez-agent-ready'); ?></label></th>
					<td>
						<input name="<?php echo esc_attr(NEXEZ_AGENT_READY_OPTION); ?>[token]" id="nexez-token" type="text" class="regular-text" value="<?php echo esc_attr($opts['token']); ?>" placeholder="nexez-site-verify-…" />
						<p class="description"><?php echo esc_html__('Optional. Paste the token from Nexez → Settings → Your website to let this plugin serve the file/meta ownership proof.', 'nexez-agent-ready'); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
