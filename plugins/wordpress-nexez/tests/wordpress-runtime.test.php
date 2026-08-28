<?php
/**
 * WordPress runtime checks for Nexez Agent-Ready.
 *
 * Run with `wp eval-file` after activating the plugin in a clean WordPress
 * installation. This file is excluded from the release ZIP.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit( 1 );
}

/**
 * Stop the runtime check on the first failed assertion.
 *
 * @param bool   $condition Assertion result.
 * @param string $message Failure description.
 * @return void
 */
function nexez_runtime_assert( $condition, $message ) {
	if ( ! $condition ) {
		fwrite( STDERR, 'FAIL: ' . $message . "\n" );
		exit( 1 );
	}
}

$nexez_runtime_request = array();
$nexez_runtime_embed   = array(
	'ok'             => true,
	'slug'           => 'runtime-demo',
	'name'           => 'Demo" onload="alert(1)',
	'headLink'       => '<script>alert("remote-html")</script>',
	'structuredData' => array(
		'@context'   => 'https://schema.org',
		'@type'      => 'WebPage',
		'name'       => '</script><script>alert("json")</script>',
		'mainEntity' => array(
			'@type' => 'Organization',
		),
	),
	'artifacts'      => array(
		'agentJson' => 'https://nexez.app/runtime-demo/agent.json',
	),
	'redirects'      => array(
		array(
			'from' => '/openapi.json',
			'to'   => 'https://attacker.test/openapi.json',
		),
		array(
			'from' => '/mcp.json',
			'to'   => 'https://attacker.test/mcp.json',
		),
	),
);

add_filter(
	'pre_http_request',
	function ( $preempt, $args, $url ) use ( &$nexez_runtime_request, $nexez_runtime_embed ) {
		$nexez_runtime_request = array(
			'args' => $args,
			'url'  => $url,
		);
		return array(
			'headers'  => array( 'content-type' => 'application/json; charset=utf-8' ),
			'body'     => wp_json_encode( $nexez_runtime_embed ),
			'response' => array(
				'code'    => 200,
				'message' => 'OK',
			),
			'cookies'  => array(),
			'filename' => null,
		);
	},
	10,
	3
);

update_option( NEXEZ_AGENT_READY_OPTION, array() );
$nexez_runtime_options = nexez_agent_ready_sanitize(
	array(
		'slug'  => 'https://nexez.app/runtime-demo/',
		'token' => 'nexez-site-verify-0123456789abcdef',
	)
);
nexez_runtime_assert( 'runtime-demo' === $nexez_runtime_options['slug'], 'a canonical listing URL should save as its slug' );
nexez_runtime_assert( 'nexez-site-verify-0123456789abcdef' === $nexez_runtime_options['token'], 'a valid verification token should save' );
update_option( NEXEZ_AGENT_READY_OPTION, $nexez_runtime_options );
delete_transient( 'nexez_embed_' . md5( 'runtime-demo' ) );

$embed = nexez_agent_ready_get_embed( 'runtime-demo' );
nexez_runtime_assert( true === $embed['ok'], 'a valid JSON response should load' );
nexez_runtime_assert( 'https://nexez.app/runtime-demo/embed.json' === $nexez_runtime_request['url'], 'the request host and path must be pinned' );
nexez_runtime_assert( 5 === $nexez_runtime_request['args']['timeout'], 'the request must have a short timeout' );
nexez_runtime_assert( 2 === $nexez_runtime_request['args']['redirection'], 'redirects must be limited' );
nexez_runtime_assert( 512 * KB_IN_BYTES === $nexez_runtime_request['args']['limit_response_size'], 'the response size must be capped' );
nexez_runtime_assert( 'application/json' === $nexez_runtime_request['args']['headers']['Accept'], 'the request must accept JSON only' );
nexez_runtime_assert( false === strpos( $nexez_runtime_request['args']['user-agent'], home_url() ), 'the User-Agent must not disclose the site URL' );

ob_start();
nexez_agent_ready_wp_head();
$head = ob_get_clean();

nexez_runtime_assert( false !== strpos( $head, '<script type="application/ld+json">' ), 'JSON-LD should render through WordPress' );
nexez_runtime_assert( false === strpos( $head, '<script>alert' ), 'structured data must not close the JSON-LD script' );
nexez_runtime_assert( false === strpos( $head, 'remote-html' ), 'remote HTML must never be emitted' );
nexez_runtime_assert( false !== strpos( $head, '\\u003C\\/script\\u003E' ), 'dangerous JSON tag characters must be encoded' );
nexez_runtime_assert( false !== strpos( $head, 'href="https://nexez.app/runtime-demo/agent.json"' ), 'the validated manifest URL should render' );
nexez_runtime_assert( false === strpos( $head, 'title="Demo" onload=' ), 'the manifest title must remain inside its attribute' );
nexez_runtime_assert( false !== strpos( $head, 'nexez-site-verify-0123456789abcdef' ), 'the escaped verification meta should render' );

delete_transient( 'nexez_embed_' . md5( 'wrong-slug' ) );
$wrong_slug = nexez_agent_ready_get_embed( 'wrong-slug' );
nexez_runtime_assert( array() === $wrong_slug, 'a response for a different slug must be rejected' );
nexez_runtime_assert( array() === get_transient( 'nexez_embed_' . md5( 'wrong-slug' ) ), 'a rejected response should be negative cached' );

fwrite( STDOUT, "PASS: WordPress runtime checks\n" );
