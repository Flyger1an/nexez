<?php
/**
 * Uninstall cleanup for Nexez Agent-Ready.
 * Removes the stored options and any cached embed transients.
 *
 * @package Nexez_Agent_Ready
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$nexez_agent_ready_options = get_option( 'nexez_agent_ready_options', array() );
if ( is_array( $nexez_agent_ready_options ) && ! empty( $nexez_agent_ready_options['slug'] ) && is_string( $nexez_agent_ready_options['slug'] ) ) {
	delete_transient( 'nexez_embed_' . md5( $nexez_agent_ready_options['slug'] ) );
}

delete_option( 'nexez_agent_ready_options' );
