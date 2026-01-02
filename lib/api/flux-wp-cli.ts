/**
 * WP-CLI API client for FluxCloud WordPress apps
 * Executes WP-CLI commands via socket.io-based exec endpoint
 */

// Types for WP-CLI responses
export interface WPPlugin {
  name: string;
  status: 'active' | 'inactive' | 'must-use' | 'dropin';
  update: 'available' | 'none' | boolean;
  version: string;
  update_version?: string;
  title?: string;
}

export interface WPTheme {
  name: string;
  status: 'active' | 'inactive' | 'parent';
  update: 'available' | 'none';
  version: string;
  title?: string;
}

export interface WPUser {
  ID: string;
  user_login: string;
  display_name: string;
  user_email: string;
  user_registered: string;
  roles: string;
}

export interface WPCliExecParams {
  appName: string;
  nodeIp: string;
}

export interface WPCliResponse<T = unknown> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  rawOutput?: boolean;
}

export interface CreateUserParams {
  username: string;
  email: string;
  password: string;
  role: 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber';
  displayName?: string;
}

/**
 * Build WP-CLI command string for shell execution
 * Commands must run from /var/www/html where WordPress is installed
 */
function buildWpCommand(subcommand: string, options: string[] = []): string {
  const wpCommand = ['wp', subcommand, ...options, '--allow-root'].join(' ');
  return `cd /var/www/html && ${wpCommand}`;
}

/**
 * Build WP-CLI command string that returns JSON output
 * Commands must run from /var/www/html where WordPress is installed
 */
function buildWpJsonCommand(subcommand: string, options: string[] = []): string {
  const wpCommand = ['wp', subcommand, ...options, '--allow-root', '--format=json'].join(' ');
  return `cd /var/www/html && ${wpCommand}`;
}

/**
 * Parse output from socket exec response
 * Extracts JSON from shell output that includes command echo and prompt
 */
function parseSocketOutput(output: string): string {
  // The output format is: "# command && exit 0\r\nACTUAL_OUTPUT\r\n# "
  // We need to extract ACTUAL_OUTPUT

  // Split by lines
  const lines = output.split(/\r?\n/);

  // Filter out:
  // - Lines starting with # (shell prompts)
  // - Empty lines at start/end
  const contentLines = lines.filter((line, index) => {
    const trimmed = line.trim();
    // Skip command echo line (starts with #)
    if (trimmed.startsWith('#')) return false;
    // Skip empty lines
    if (trimmed === '') return false;
    return true;
  });

  return contentLines.join('\n');
}

/**
 * Execute a WP-CLI command via socket.io
 * WP-CLI runs in the 'wp' component of WordPress apps
 */
async function executeWpCommand<T>(
  zelidauth: string,
  params: WPCliExecParams,
  cmd: string
): Promise<WPCliResponse<T>> {
  try {
    const response = await fetch('/api/flux/exec-socket', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        zelidauth,
      },
      body: JSON.stringify({
        nodeIp: params.nodeIp,
        appName: params.appName,
        component: 'wp', // WP-CLI is always in the 'wp' component
        cmd,
      }),
    });

    const result = await response.json();

    if (result.status === 'success' && typeof result.data === 'string') {
      // Parse the socket output to extract actual content
      const cleanOutput = parseSocketOutput(result.data);

      // Try to parse as JSON (for --format=json commands)
      try {
        const parsed = JSON.parse(cleanOutput);
        return { status: 'success', data: parsed as T };
      } catch {
        // Return as string if not JSON
        return { status: 'success', data: cleanOutput as T };
      }
    }

    if (result.status === 'error') {
      return {
        status: 'error',
        message: result.message || 'Command failed',
      };
    }

    return { status: 'success', data: result.data as T };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to execute WP-CLI command',
    };
  }
}

// ============ Plugin Functions ============

export async function listPlugins(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<WPPlugin[]>> {
  const cmd = buildWpJsonCommand('plugin list');
  return executeWpCommand<WPPlugin[]>(zelidauth, params, cmd);
}

export async function installPlugin(
  zelidauth: string,
  params: WPCliExecParams,
  slug: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('plugin install', [slug]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function activatePlugin(
  zelidauth: string,
  params: WPCliExecParams,
  slug: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('plugin activate', [slug]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function deactivatePlugin(
  zelidauth: string,
  params: WPCliExecParams,
  slug: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('plugin deactivate', [slug]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function updatePlugin(
  zelidauth: string,
  params: WPCliExecParams,
  slug: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('plugin update', [slug]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function deletePlugin(
  zelidauth: string,
  params: WPCliExecParams,
  slug: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('plugin delete', [slug]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

// ============ Theme Functions ============

export async function listThemes(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<WPTheme[]>> {
  const cmd = buildWpJsonCommand('theme list');
  return executeWpCommand<WPTheme[]>(zelidauth, params, cmd);
}

export async function installTheme(
  zelidauth: string,
  params: WPCliExecParams,
  slug: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('theme install', [slug]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function activateTheme(
  zelidauth: string,
  params: WPCliExecParams,
  slug: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('theme activate', [slug]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function deleteTheme(
  zelidauth: string,
  params: WPCliExecParams,
  slug: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('theme delete', [slug]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

// ============ User Functions ============

export async function listUsers(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<WPUser[]>> {
  const cmd = buildWpJsonCommand('user list');
  return executeWpCommand<WPUser[]>(zelidauth, params, cmd);
}

export async function createUser(
  zelidauth: string,
  params: WPCliExecParams,
  userData: CreateUserParams
): Promise<WPCliResponse<string>> {
  // Escape special characters in username and password
  const escapedUsername = userData.username.replace(/'/g, "'\\''");
  const escapedPassword = userData.password.replace(/'/g, "'\\''");
  const escapedEmail = userData.email.replace(/'/g, "'\\''");

  const options = [
    `'${escapedUsername}'`,
    `'${escapedEmail}'`,
    `--role=${userData.role}`,
    `--user_pass='${escapedPassword}'`,
  ];
  if (userData.displayName) {
    const escapedDisplayName = userData.displayName.replace(/'/g, "'\\''");
    options.push(`--display_name='${escapedDisplayName}'`);
  }
  const cmd = buildWpCommand('user create', options);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function resetUserPassword(
  zelidauth: string,
  params: WPCliExecParams,
  userId: string,
  newPassword: string
): Promise<WPCliResponse<string>> {
  const escapedPassword = newPassword.replace(/'/g, "'\\''");
  const cmd = buildWpCommand('user update', [userId, `--user_pass='${escapedPassword}'`]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function deleteUser(
  zelidauth: string,
  params: WPCliExecParams,
  userId: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('user delete', [userId, '--yes']);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

// ============ General Info Functions ============

export async function getWpVersion(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('core version');
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function flushCache(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('cache flush');
  return executeWpCommand<string>(zelidauth, params, cmd);
}

// ============ Error Log Functions ============

export type LogType = 'php' | 'nginx' | 'wordpress';

export const LOG_PATHS: Record<LogType, string> = {
  php: '/var/log/php-fpm-error.log',
  nginx: '/var/log/nginx/error.log',
  wordpress: '/var/www/html/wp-content/debug.log',
};

export async function getErrorLog(
  zelidauth: string,
  params: WPCliExecParams,
  logType: LogType,
  lines: number = 100
): Promise<WPCliResponse<string>> {
  const logPath = LOG_PATHS[logType];
  // Use tail to get last N lines, suppress errors if file doesn't exist
  const cmd = `tail -n ${lines} ${logPath} 2>/dev/null || echo ""`;
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function clearErrorLog(
  zelidauth: string,
  params: WPCliExecParams,
  logType: LogType
): Promise<WPCliResponse<string>> {
  const logPath = LOG_PATHS[logType];
  // Truncate the file to clear it
  const cmd = `truncate -s 0 ${logPath} 2>/dev/null && echo "Log cleared successfully" || echo "Could not clear log file"`;
  return executeWpCommand<string>(zelidauth, params, cmd);
}

export async function getLogFileInfo(
  zelidauth: string,
  params: WPCliExecParams,
  logType: LogType
): Promise<WPCliResponse<{ exists: boolean; size: string; modified: string }>> {
  const logPath = LOG_PATHS[logType];
  // Check if file exists and get its info
  const cmd = `if [ -f ${logPath} ]; then stat -c '{"exists":true,"size":"%s","modified":"%y"}' ${logPath} 2>/dev/null || stat -f '{"exists":true,"size":"%z","modified":"%m"}' ${logPath} 2>/dev/null; else echo '{"exists":false,"size":"0","modified":""}'; fi`;
  return executeWpCommand<{ exists: boolean; size: string; modified: string }>(zelidauth, params, cmd);
}
