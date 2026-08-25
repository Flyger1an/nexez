<?php
/**
 * Uninstall cleanup for Nexez Agent-Ready.
 * Removes the stored options and any cached embed transients.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
	exit;
}

$options = get_option('nexez_agent_ready_options', array());
if (is_array($options) && !empty($options['slug']) && is_string($options['slug'])) {
	delete_transient('nexez_embed_' . md5($options['slug']));
}

delete_option('nexez_agent_ready_options');
