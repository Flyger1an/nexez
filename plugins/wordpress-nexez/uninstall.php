<?php
/**
 * Uninstall cleanup for Nexez Agent-Ready.
 * Removes the stored options and any cached embed transients.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
	exit;
}

delete_option('nexez_agent_ready_options');

// Clear any embed-manifest transients (both value + timeout rows).
global $wpdb;
$wpdb->query(
	"DELETE FROM {$wpdb->options} WHERE option_name LIKE '\_transient\_nexez\_embed\_%' OR option_name LIKE '\_transient\_timeout\_nexez\_embed\_%'"
);
