/**
 * Shared types for WP-CLI components
 */

export interface BaseWpCliProps {
  appName: string;
  nodeIp: string;
}

export interface CommandExecutionState {
  isLoading: boolean;
  error: string | null;
  lastResult: string | null;
}
