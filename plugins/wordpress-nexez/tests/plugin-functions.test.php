<?php
/**
 * Focused regression tests for the standalone plugin functions.
 *
 * This file uses small WordPress stubs so it can run on every supported PHP
 * version. The release ZIP excludes the tests directory. Full WordPress runtime
 * coverage runs separately in the clean-install QA environment.
 */

define('ABSPATH', __DIR__ . '/');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
define('KB_IN_BYTES', 1024);

$nexez_test_options = array('slug' => '', 'token' => '');
$nexez_test_transients = array();
$nexez_test_deleted_transients = array();
$nexez_test_settings_errors = array();

function add_filter() {}
function add_action() {}
function get_option() {
	global $nexez_test_options;
	return $nexez_test_options;
}
function wp_parse_args($args, $defaults) {
	return array_merge($defaults, $args);
}
function wp_parse_url($url, $component = -1) {
	return parse_url($url, $component);
}
function get_transient($key) {
	global $nexez_test_transients;
	return array_key_exists($key, $nexez_test_transients) ? $nexez_test_transients[$key] : false;
}
function set_transient($key, $value) {
	global $nexez_test_transients;
	$nexez_test_transients[$key] = $value;
}
function delete_transient($key) {
	global $nexez_test_deleted_transients;
	$nexez_test_deleted_transients[] = $key;
}
function sanitize_text_field($value) {
	return trim(strip_tags($value));
}
function sanitize_key($value) {
	return preg_replace('/[^a-z0-9_\-]/', '', strtolower($value));
}
function wp_unslash($value) {
	return stripslashes($value);
}
function add_settings_error($setting, $code, $message) {
	global $nexez_test_settings_errors;
	$nexez_test_settings_errors[] = array($setting, $code, $message);
}
function __($value) {
	return $value;
}
function wp_json_encode($value, $flags = 0) {
	return json_encode($value, $flags);
}
function wp_kses($value) {
	return $value;
}
function esc_url($value) {
	return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}
function esc_attr($value) {
	return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}
function is_admin() {
	return false;
}

require dirname(__DIR__) . '/nexez-agent-ready.php';

function nexez_test_assert($condition, $message) {
	if (!$condition) {
		fwrite(STDERR, "FAIL: {$message}\n");
		exit(1);
	}
}

function nexez_test_embed($overrides = array()) {
	return array_merge(
		array(
			'ok'             => true,
			'slug'           => 'demo',
			'name'           => 'Demo',
			'structuredData' => array(
				'@context'   => 'https://schema.org',
				'@type'      => 'WebPage',
				'name'       => 'Demo',
				'mainEntity' => array('@type' => 'Organization'),
			),
			'artifacts'      => array('agentJson' => 'https://nexez.app/demo/agent.json'),
		),
		$overrides
	);
}

nexez_test_assert(nexez_agent_ready_is_trusted_url('https://nexez.app/demo/agent.json'), 'canonical artifact URL should be trusted');
nexez_test_assert(!nexez_agent_ready_is_trusted_url('http://nexez.app/demo/agent.json'), 'HTTP must be rejected');
nexez_test_assert(!nexez_agent_ready_is_trusted_url('https://nexez.app.attacker.test/demo/agent.json'), 'suffix host must be rejected');
nexez_test_assert(!nexez_agent_ready_is_trusted_url('https://user@nexez.app/demo/agent.json'), 'credentials must be rejected');
nexez_test_assert(!nexez_agent_ready_is_trusted_url('https://nexez.app:443/demo/agent.json'), 'explicit ports must be rejected');

$legacy = nexez_test_embed(array(
	'structuredData' => null,
	'jsonld'         => '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","mainEntity":{"@type":"Organization"}}</script>',
));
nexez_test_assert('WebPage' === nexez_agent_ready_structured_data($legacy)['@type'], 'legacy JSON-LD should be decoded as data');
nexez_test_assert(empty(nexez_agent_ready_structured_data(array('jsonld' => '<script>alert(1)</script>'))), 'arbitrary remote scripts must be rejected');

$nexez_test_options = array('slug' => 'demo', 'token' => '');
$malicious = nexez_test_embed(array(
	'name'           => 'Demo" onload="alert(1)',
	'headLink'       => '<script>alert("remote html")</script>',
	'structuredData' => array(
		'@context'   => 'https://schema.org',
		'@type'      => 'WebPage',
		'name'       => '</script><script>alert("json")</script>',
		'mainEntity' => array('@type' => 'Organization'),
	),
));
$nexez_test_transients['nexez_embed_' . md5('demo')] = $malicious;
ob_start();
nexez_agent_ready_wp_head();
$head = ob_get_clean();
nexez_test_assert(false === strpos($head, '<script>alert'), 'JSON values must not close the JSON-LD script');
nexez_test_assert(false === strpos($head, 'remote html'), 'legacy remote headLink HTML must be ignored');
nexez_test_assert(false !== strpos($head, '\\u003C\\/script\\u003E'), 'tag characters must be JSON hex encoded');
nexez_test_assert(false !== strpos($head, '&quot; onload=&quot;alert(1)'), 'manifest title must be attribute escaped');

$nexez_test_options = array('slug' => 'old-slug', 'token' => 'nexez-site-verify-0123456789abcdef');
$sanitized = nexez_agent_ready_sanitize(array(
	'slug'  => 'https://nexez.app/new-slug/',
	'token' => 'nexez-site-verify-fedcba9876543210',
));
nexez_test_assert('new-slug' === $sanitized['slug'], 'canonical listing URL should normalize to its slug');
nexez_test_assert(in_array('nexez_embed_' . md5('old-slug'), $nexez_test_deleted_transients, true), 'old slug cache must be cleared');
nexez_test_assert(in_array('nexez_embed_' . md5('new-slug'), $nexez_test_deleted_transients, true), 'new slug cache must be cleared');

$sanitized = nexez_agent_ready_sanitize(array('slug' => 'https://attacker.test/other', 'token' => 'bad'));
nexez_test_assert('old-slug' === $sanitized['slug'], 'untrusted listing URL must not replace the saved slug');
nexez_test_assert('nexez-site-verify-0123456789abcdef' === $sanitized['token'], 'invalid token must not erase the saved token');
nexez_test_assert(2 <= count($nexez_test_settings_errors), 'invalid settings should report errors');

fwrite(STDOUT, "PASS: plugin function regressions\n");
