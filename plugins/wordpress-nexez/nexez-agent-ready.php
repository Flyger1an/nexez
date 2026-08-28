<?php
/**
 * Plugin Name:       Nexez Agent-Ready
 * Plugin URI:        https://nexez.ai/scan
 * Description:       Connect your Nexez listing to WordPress with live structured data and agent-ready discovery files.
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
 * https://nexez.app/<slug>) into the settings. The plugin then fetches the
 * public listing manifest from https://nexez.app/<slug>/embed.json and:
 *   - validates its structured data, encodes it locally, and adds JSON-LD plus
 *     a locally constructed manifest <link> to <head>, and
 *   - 301-redirects the agent artifact paths on your domain to your live
 *     Nexez listing (so an agent probing yoursite.com/.well-known/agent.json
 *     gets your current offers, with nothing to maintain and nothing going stale).
 *
 * The plugin never accepts executable markup from the service. It validates
 * public JSON data and constructs all output locally. The only network host it
 * contacts is nexez.app.
 *
 * @package Nexez_Agent_Ready
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

define( 'NEXEZ_AGENT_READY_VERSION', '1.0.0' );
define( 'NEXEZ_AGENT_READY_HOST', 'https://nexez.app' );
define( 'NEXEZ_AGENT_READY_OPTION', 'nexez_agent_ready_options' );

/**
 * Merged plugin options with defaults.
 *
 * @return array{slug:string,token:string}
 */
function nexez_agent_ready_options() {
	$opts = get_option( NEXEZ_AGENT_READY_OPTION, array() );
	if ( ! is_array( $opts ) ) {
		$opts = array();
	}
	return wp_parse_args(
		$opts,
		array(
			'slug'  => '',
			'token' => '',
		)
	);
}

/**
 * A URL is safe to redirect to only if it points at the pinned Nexez host, so a
 * redirect target can never send visitors off to an arbitrary origin, whatever the
 * embed response contains.
 *
 * @param mixed $url URL to validate.
 * @return bool
 */
function nexez_agent_ready_is_trusted_url( $url ) {
	if ( ! is_string( $url ) ) {
		return false;
	}

	$parts = wp_parse_url( $url );
	if ( ! is_array( $parts ) ) {
		return false;
	}

	return isset( $parts['scheme'], $parts['host'], $parts['path'] )
		&& 'https' === strtolower( $parts['scheme'] )
		&& 'nexez.app' === strtolower( $parts['host'] )
		&& '/' === substr( $parts['path'], 0, 1 )
		&& empty( $parts['user'] )
		&& empty( $parts['pass'] )
		&& empty( $parts['port'] );
}

/**
 * Allow safe redirects to the single host used for Nexez agent artifacts.
 *
 * @param string[] $hosts Allowed redirect hosts.
 * @return string[]
 */
function nexez_agent_ready_allowed_redirect_hosts( $hosts ) {
	$hosts[] = 'nexez.app';
	return array_unique( $hosts );
}
add_filter( 'allowed_redirect_hosts', 'nexez_agent_ready_allowed_redirect_hosts' );

/**
 * Fetch + cache the listing's embed manifest from Nexez (host-pinned to nexez.app).
 * Returns array() on any failure (brief negative cache so a down API doesn't hammer).
 *
 * @param string $slug Validated listing slug.
 * @return array
 */
function nexez_agent_ready_get_embed( $slug ) {
	if ( ! $slug ) {
		return array();
	}
	$key    = 'nexez_embed_' . md5( $slug );
	$cached = get_transient( $key );
	if ( is_array( $cached ) ) {
		return $cached;
	}

	$url = NEXEZ_AGENT_READY_HOST . '/' . rawurlencode( $slug ) . '/embed.json';
	$res = wp_safe_remote_get(
		$url,
		array(
			'timeout'             => 5,
			'redirection'         => 2,
			'limit_response_size' => 512 * KB_IN_BYTES,
			'user-agent'          => 'Nexez-Agent-Ready/' . NEXEZ_AGENT_READY_VERSION . '; WordPress',
			'headers'             => array( 'Accept' => 'application/json' ),
		)
	);

	if ( is_wp_error( $res ) || 200 !== (int) wp_remote_retrieve_response_code( $res ) ) {
		set_transient( $key, array(), 5 * MINUTE_IN_SECONDS );
		return array();
	}

	$content_type = wp_remote_retrieve_header( $res, 'content-type' );
	if ( ! is_string( $content_type ) || false === stripos( $content_type, 'application/json' ) ) {
		set_transient( $key, array(), 5 * MINUTE_IN_SECONDS );
		return array();
	}

	$data = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( ! is_array( $data ) || true !== ( $data['ok'] ?? false ) || ! isset( $data['slug'] ) || $slug !== $data['slug'] ) {
		set_transient( $key, array(), 5 * MINUTE_IN_SECONDS );
		return array();
	}

	set_transient( $key, $data, HOUR_IN_SECONDS );
	return $data;
}

/**
 * Return validated schema.org data from the embed response.
 *
 * New responses expose the object as `structuredData`. The legacy `jsonld`
 * fallback is decoded as JSON only, never emitted as remote HTML.
 *
 * @param array $data Embed response.
 * @return array
 */
function nexez_agent_ready_structured_data( $data ) {
	$structured = isset( $data['structuredData'] ) && is_array( $data['structuredData'] )
		? $data['structuredData']
		: array();

	if ( empty( $structured ) && isset( $data['jsonld'] ) && is_string( $data['jsonld'] ) ) {
		$prefix = '<script type="application/ld+json">';
		$suffix = '</script>';
		if ( 0 === strpos( $data['jsonld'], $prefix ) && substr( $data['jsonld'], -strlen( $suffix ) ) === $suffix ) {
			$json       = substr( $data['jsonld'], strlen( $prefix ), -strlen( $suffix ) );
			$structured = json_decode( $json, true );
		}
	}

	if ( ! is_array( $structured )
		|| 'https://schema.org' !== ( $structured['@context'] ?? '' )
		|| 'WebPage' !== ( $structured['@type'] ?? '' )
		|| ! isset( $structured['mainEntity'] )
		|| ! is_array( $structured['mainEntity'] ) ) {
		return array();
	}

	return $structured;
}

/**
 * Return the validated public agent manifest URL from an embed response.
 *
 * @param array $data Embed response.
 * @return string
 */
function nexez_agent_ready_manifest_url( $data ) {
	$url = isset( $data['artifacts'] ) && is_array( $data['artifacts'] ) && isset( $data['artifacts']['agentJson'] )
		? $data['artifacts']['agentJson']
		: '';
	return nexez_agent_ready_is_trusted_url( $url ) ? $url : '';
}

/**
 * Add locally constructed JSON-LD, a manifest link, and verification metadata.
 * Remote HTML is never printed into the WordPress page.
 */
function nexez_agent_ready_wp_head() {
	$opts = nexez_agent_ready_options();
	if ( '' === $opts['slug'] ) {
		return;
	}

	$data       = nexez_agent_ready_get_embed( $opts['slug'] );
	$structured = nexez_agent_ready_structured_data( $data );
	if ( ! empty( $structured ) ) {
		$json = wp_json_encode( $structured, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT );
		if ( is_string( $json ) ) {
			echo wp_kses(
				"\n" . '<script type="application/ld+json">' . $json . '</script>' . "\n",
				array( 'script' => array( 'type' => true ) )
			);
		}
	}

	$manifest_url = nexez_agent_ready_manifest_url( $data );
	if ( '' !== $manifest_url ) {
		$name = isset( $data['name'] ) && is_string( $data['name'] ) ? sanitize_text_field( $data['name'] ) : $opts['slug'];
		echo '<link rel="alternate" type="application/json" href="' . esc_url( $manifest_url ) . '" title="' . esc_attr( $name . ' - agent manifest' ) . '">' . "\n";
	}

	if ( '' !== $opts['token'] ) {
		echo '<meta name="nexez-site-verification" content="' . esc_attr( $opts['token'] ) . '">' . "\n";
	}
}
add_action( 'wp_head', 'nexez_agent_ready_wp_head', 5 );

/**
 * Serve the agent artifacts on THIS domain by 301-redirecting them to the live
 * Nexez listing, and serve the file-verification token. Runs early on front-end
 * GET/HEAD requests only, matches EXACT paths, and no-ops otherwise. Because WP
 * only handles a request when the web server found no matching static file, an
 * existing real /llms.txt on the site is served by the server and never reaches
 * this hook.
 */
function nexez_agent_ready_intercept() {
	if ( is_admin() ) {
		return;
	}
	$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( sanitize_key( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) : 'GET';
	if ( 'GET' !== $method && 'HEAD' !== $method ) {
		return;
	}

	$opts = nexez_agent_ready_options();
	if ( '' === $opts['slug'] ) {
		return;
	}

	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
	$path = is_string( $uri ) ? wp_parse_url( $uri, PHP_URL_PATH ) : '';
	if ( ! is_string( $path ) || '' === $path ) {
		return;
	}
	// Normalize a trailing slash but keep the exact path otherwise.
	if ( '/' !== $path ) {
		$path = rtrim( $path, '/' );
	}

	// The file-verification proof (Nexez Settings > "Verify (file)" fetches this).
	if ( '/.well-known/nexez-verify.txt' === $path && '' !== $opts['token'] ) {
		status_header( 200 );
		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'X-Robots-Tag: noindex' );
		echo esc_html( $opts['token'] );
		exit;
	}

	$candidates = array( '/.well-known/agent.json', '/agent.json', '/llms.txt', '/openapi.json', '/mcp.json' );
	if ( ! in_array( $path, $candidates, true ) ) {
		return;
	}

	// Prefer the live redirect map from the cached embed manifest (it reflects
	// whether MCP is enabled); fall back to the always-present artifacts if the
	// API is unreachable.
	$data = nexez_agent_ready_get_embed( $opts['slug'] );
	if ( ! empty( $data['redirects'] ) && is_array( $data['redirects'] ) ) {
		foreach ( $data['redirects'] as $rule ) {
			if ( isset( $rule['from'], $rule['to'] ) && $rule['from'] === $path
				&& nexez_agent_ready_is_trusted_url( $rule['to'] ) ) {
				wp_safe_redirect( esc_url_raw( $rule['to'] ), 301 );
				exit;
			}
		}
	}

	$listing  = NEXEZ_AGENT_READY_HOST . '/' . rawurlencode( $opts['slug'] );
	$fallback = array(
		'/.well-known/agent.json' => '/agent.json',
		'/agent.json'             => '/agent.json',
		'/llms.txt'               => '/llms.txt',
		'/openapi.json'           => '/openapi.json',
	);
	if ( isset( $fallback[ $path ] ) ) {
		wp_safe_redirect( esc_url_raw( $listing . $fallback[ $path ] ), 301 );
		exit;
	}
}
add_action( 'template_redirect', 'nexez_agent_ready_intercept', 0 );

// Admin settings.

/**
 * Validate + normalize submitted settings. Accepts a pasted slug OR a full
 * listing URL (extracts the last path segment). Clears the embed cache on change.
 *
 * @param array $input Raw form input.
 * @return array{slug:string,token:string}
 */
function nexez_agent_ready_sanitize( $input ) {
	if ( ! is_array( $input ) ) {
		$input = array();
	}

	$previous = nexez_agent_ready_options();
	$raw_slug = isset( $input['slug'] ) && is_scalar( $input['slug'] )
		? strtolower( trim( sanitize_text_field( wp_unslash( (string) $input['slug'] ) ) ) )
		: '';
	$slug     = $raw_slug;
	if ( false !== strpos( $raw_slug, '/' ) ) {
		$url   = preg_match( '#^https?://#i', $raw_slug ) ? $raw_slug : 'https://' . ltrim( $raw_slug, '/' );
		$parts = wp_parse_url( $url );
		$path  = is_array( $parts ) && isset( $parts['path'] ) ? trim( $parts['path'], '/' ) : '';
		if ( ! is_array( $parts ) || ! isset( $parts['host'] ) || 'nexez.app' !== strtolower( $parts['host'] ) || false !== strpos( $path, '/' ) ) {
			$slug = '';
		} else {
			$slug = $path;
		}
	}
	if ( '' !== $raw_slug && ! preg_match( '/^[a-z0-9-]{1,80}$/', (string) $slug ) ) {
		add_settings_error( 'nexez_agent_ready', 'bad_slug', __( 'Enter a valid Nexez listing slug or a nexez.app listing URL.', 'nexez-agent-ready' ) );
		$slug = $previous['slug'];
	}

	$token = isset( $input['token'] ) && is_scalar( $input['token'] )
		? trim( sanitize_text_field( wp_unslash( (string) $input['token'] ) ) )
		: '';
	if ( '' !== $token && ! preg_match( '/^nexez-site-verify-[0-9a-f]{16,64}$/', $token ) ) {
		add_settings_error( 'nexez_agent_ready', 'bad_token', __( 'That verification token does not look right. Copy it exactly from Nexez Settings.', 'nexez-agent-ready' ) );
		$token = $previous['token'];
	}

	if ( '' !== $previous['slug'] ) {
		delete_transient( 'nexez_embed_' . md5( $previous['slug'] ) );
	}
	if ( '' !== $slug ) {
		delete_transient( 'nexez_embed_' . md5( $slug ) );
	}

	return array(
		'slug'  => $slug,
		'token' => $token,
	);
}

/** Register the plugin option and its sanitizer. */
function nexez_agent_ready_register_settings() {
	register_setting(
		'nexez_agent_ready',
		NEXEZ_AGENT_READY_OPTION,
		array(
			'type'              => 'array',
			'sanitize_callback' => 'nexez_agent_ready_sanitize',
			'default'           => array(
				'slug'  => '',
				'token' => '',
			),
		)
	);
}
add_action( 'admin_init', 'nexez_agent_ready_register_settings' );

/** Add the plugin page under WordPress Settings. */
function nexez_agent_ready_add_menu() {
	add_options_page(
		__( 'Nexez Agent-Ready', 'nexez-agent-ready' ),
		__( 'Nexez Agent-Ready', 'nexez-agent-ready' ),
		'manage_options',
		'nexez-agent-ready',
		'nexez_agent_ready_render_settings'
	);
}
add_action( 'admin_menu', 'nexez_agent_ready_add_menu' );

/** Render the administrator-only settings screen. */
function nexez_agent_ready_render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$opts = nexez_agent_ready_options();
	$data = $opts['slug'] ? nexez_agent_ready_get_embed( $opts['slug'] ) : array();
	?>
	<div class="wrap">
		<h1><?php echo esc_html__( 'Nexez Agent-Ready', 'nexez-agent-ready' ); ?></h1>
		<p><?php echo esc_html__( 'Make this site legible and transactable to AI agents. Paste your Nexez listing slug below. The plugin injects your structured data and serves your live agent artifacts automatically.', 'nexez-agent-ready' ); ?></p>

		<?php if ( $opts['slug'] ) : ?>
			<?php if ( ! empty( $data['ok'] ) ) : ?>
				<div class="notice notice-success inline"><p>
					<?php
					/* translators: %s: the connected Nexez listing name. */
					echo esc_html( sprintf( __( 'Connected to “%s”. Your JSON-LD and artifacts are live.', 'nexez-agent-ready' ), isset( $data['name'] ) ? (string) $data['name'] : $opts['slug'] ) );
					?>
				</p></div>
			<?php else : ?>
				<div class="notice notice-warning inline"><p>
					<?php echo esc_html__( 'Could not reach that listing on Nexez yet. Double-check the slug, and make sure the listing is published.', 'nexez-agent-ready' ); ?>
				</p></div>
			<?php endif; ?>
		<?php endif; ?>

		<form action="options.php" method="post">
			<?php settings_fields( 'nexez_agent_ready' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="nexez-slug"><?php echo esc_html__( 'Listing slug', 'nexez-agent-ready' ); ?></label></th>
					<td>
						<input name="<?php echo esc_attr( NEXEZ_AGENT_READY_OPTION ); ?>[slug]" id="nexez-slug" type="text" class="regular-text" value="<?php echo esc_attr( $opts['slug'] ); ?>" placeholder="your-listing-slug" />
						<p class="description"><?php echo esc_html__( 'From your listing URL: https://nexez.app/<slug>. You can paste the full URL too.', 'nexez-agent-ready' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="nexez-token"><?php echo esc_html__( 'Verification token', 'nexez-agent-ready' ); ?></label></th>
					<td>
						<input name="<?php echo esc_attr( NEXEZ_AGENT_READY_OPTION ); ?>[token]" id="nexez-token" type="text" class="regular-text" value="<?php echo esc_attr( $opts['token'] ); ?>" placeholder="nexez-site-verify-…" />
						<p class="description"><?php echo esc_html__( 'Optional. Paste the token from Nexez > Settings > Your website to let this plugin serve the file and meta ownership proof.', 'nexez-agent-ready' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}
