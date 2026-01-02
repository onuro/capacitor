/**
 * WordPress detection utilities for FluxCloud apps
 */

import { FluxApp } from '@/lib/api/flux-apps';

/**
 * Check if an app is a WordPress app by checking for runonflux/wp-nginx image
 */
export function isWordPressApp(app: FluxApp): boolean {
  if (!app?.compose) return false;
  return app.compose.some((c) => c.repotag.includes('runonflux/wp-nginx'));
}

/**
 * Get the WordPress component name (always 'wp' for FluxCloud WP apps)
 */
export function getWpComponentName(): string {
  return 'wp';
}

/**
 * Find the WordPress component in an app's compose array
 */
export function findWpComponent(app: FluxApp) {
  if (!app?.compose) return null;
  return app.compose.find((c) => c.repotag.includes('runonflux/wp-nginx')) || null;
}
