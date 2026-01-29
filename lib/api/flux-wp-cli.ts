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

export interface WPMedia {
  ID: string;
  post_title: string;
  post_name: string;
  post_mime_type: string;
  post_date: string;
  guid: string;
}

export interface MediaImportOptions {
  title?: string;
  alt?: string;
  caption?: string;
  description?: string;
  postId?: number; // Attach to a specific post
  featuredImage?: boolean; // Set as featured image for the postId
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
  // - PHP diagnostic lines (warnings, notices, errors from stderr)
  const contentLines = lines.filter((line) => {
    const trimmed = line.trim();
    // Skip command echo line (starts with #)
    if (trimmed.startsWith('#')) return false;
    // Skip empty lines
    if (trimmed === '') return false;
    // Skip PHP diagnostic output (e.g., "[29-Jan-2026 09:36:08 UTC] PHP Warning: ...")
    if (/^\[.*\]\s*PHP\s+(Warning|Notice|Fatal error|Deprecated|Parse error|Strict Standards):/.test(trimmed)) return false;
    // Also skip PHP diagnostics without timestamp prefix
    if (/^PHP\s+(Warning|Notice|Fatal error|Deprecated|Parse error|Strict Standards):/.test(trimmed)) return false;
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
        // Direct parse failed — try extracting JSON substring from output
        // This handles cases where non-JSON text (e.g. PHP warnings) wasn't fully filtered
        const jsonMatch = cleanOutput.match(/\[\s*\{[\s\S]*\}\s*\]|\[\s*\]|\{"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            return { status: 'success', data: parsed as T };
          } catch {
            // Fall through to return as string
          }
        }
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

// ============ Core Maintenance Functions ============

export interface CoreReinstallParams {
  siteUrl: string;
  siteTitle: string;
  adminUser: string;
  adminPassword: string;
  adminEmail: string;
}

/**
 * Export database backup before destructive operations
 * Best practice: Always backup before risky operations
 */
export async function exportDatabase(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<string>> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `/var/www/html/wp-content/backup-${timestamp}.sql`;
  const cmd = buildWpCommand('db export', [backupPath]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Reset database - clears all WordPress data
 * WARNING: This is a destructive operation
 */
export async function resetDatabase(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('db reset', ['--yes']);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Download fresh WordPress core files
 * Uses --force to overwrite existing files
 */
export async function downloadCore(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('core download', ['--force']);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Install WordPress with provided configuration
 * Must be run after resetDatabase and downloadCore
 */
export async function installCore(
  zelidauth: string,
  params: WPCliExecParams,
  installParams: CoreReinstallParams
): Promise<WPCliResponse<string>> {
  const escapedTitle = installParams.siteTitle.replace(/'/g, "'\\''");
  const escapedUser = installParams.adminUser.replace(/'/g, "'\\''");
  const escapedPassword = installParams.adminPassword.replace(/'/g, "'\\''");
  const escapedEmail = installParams.adminEmail.replace(/'/g, "'\\''");

  const options = [
    `--url='${installParams.siteUrl}'`,
    `--title='${escapedTitle}'`,
    `--admin_user='${escapedUser}'`,
    `--admin_password='${escapedPassword}'`,
    `--admin_email='${escapedEmail}'`,
  ];
  const cmd = buildWpCommand('core install', options);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Get WordPress core information including version and update status
 */
export async function getCoreInfo(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<{ version: string; updateAvailable: boolean; latestVersion?: string }>> {
  const versionCmd = buildWpCommand('core version');
  const versionResult = await executeWpCommand<string>(zelidauth, params, versionCmd);

  if (versionResult.status === 'error') {
    return { status: 'error', message: versionResult.message };
  }

  // Check for updates
  const checkCmd = buildWpCommand('core check-update', ['--format=json']);
  const updateResult = await executeWpCommand<Array<{ version: string }>>(zelidauth, params, checkCmd);

  const version = typeof versionResult.data === 'string' ? versionResult.data.trim() : '';
  const updates = Array.isArray(updateResult.data) ? updateResult.data : [];

  return {
    status: 'success',
    data: {
      version,
      updateAvailable: updates.length > 0,
      latestVersion: updates.length > 0 ? updates[0].version : undefined,
    },
  };
}

/**
 * Update WordPress core to the latest version
 */
export async function updateCore(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('core update');
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Verify WordPress core file integrity
 */
export async function verifyCoreChecksums(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('core verify-checksums');
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Flush all caches (object cache and rewrite rules)
 */
export async function flushAllCaches(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<string>> {
  const cmd = `cd /var/www/html && wp cache flush --allow-root && wp rewrite flush --allow-root`;
  return executeWpCommand<string>(zelidauth, params, cmd);
}

// ============ Config Functions ============

export interface WPConfigItem {
  name: string;
  value: string;
  type: 'constant' | 'variable';
}

export interface SetConfigOptions {
  type?: 'constant' | 'variable';
  raw?: boolean; // For non-string values (true, false, numbers)
}

/**
 * List all wp-config.php constants and variables
 */
export async function listConfig(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<WPConfigItem[]>> {
  const cmd = buildWpJsonCommand('config list');
  return executeWpCommand<WPConfigItem[]>(zelidauth, params, cmd);
}

/**
 * Get a specific config value
 */
export async function getConfig(
  zelidauth: string,
  params: WPCliExecParams,
  name: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('config get', [name]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Set or add a config constant/variable
 */
export async function setConfig(
  zelidauth: string,
  params: WPCliExecParams,
  name: string,
  value: string,
  options: SetConfigOptions = {}
): Promise<WPCliResponse<string>> {
  const escapedValue = value.replace(/'/g, "'\\''");
  const cmdOptions: string[] = [name];

  // For raw values (true, false, numbers), don't quote the value
  if (options.raw) {
    cmdOptions.push(value);
    cmdOptions.push('--raw');
  } else {
    cmdOptions.push(`'${escapedValue}'`);
  }

  if (options.type) {
    cmdOptions.push(`--type=${options.type}`);
  }

  const cmd = buildWpCommand('config set', cmdOptions);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Delete a config constant/variable
 */
export async function deleteConfig(
  zelidauth: string,
  params: WPCliExecParams,
  name: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('config delete', [name]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Check if a config constant/variable exists
 */
export async function hasConfig(
  zelidauth: string,
  params: WPCliExecParams,
  name: string
): Promise<WPCliResponse<boolean>> {
  const cmd = buildWpCommand('config has', [name]);
  const result = await executeWpCommand<string>(zelidauth, params, cmd);
  // wp config has returns exit code 0 if exists, 1 if not
  return {
    status: 'success',
    data: result.status === 'success',
  };
}

// ============ Media Functions ============

/**
 * Build media import options array from MediaImportOptions
 */
function buildMediaImportOptions(options: MediaImportOptions = {}): string[] {
  const cmdOptions: string[] = [];

  if (options.title) {
    const escapedTitle = options.title.replace(/'/g, "'\\''");
    cmdOptions.push(`--title='${escapedTitle}'`);
  }

  if (options.alt) {
    const escapedAlt = options.alt.replace(/'/g, "'\\''");
    cmdOptions.push(`--alt='${escapedAlt}'`);
  }

  if (options.caption) {
    const escapedCaption = options.caption.replace(/'/g, "'\\''");
    cmdOptions.push(`--caption='${escapedCaption}'`);
  }

  if (options.description) {
    const escapedDesc = options.description.replace(/'/g, "'\\''");
    cmdOptions.push(`--desc='${escapedDesc}'`);
  }

  if (options.postId) {
    cmdOptions.push(`--post_id=${options.postId}`);
  }

  if (options.featuredImage && options.postId) {
    cmdOptions.push('--featured_image');
  }

  return cmdOptions;
}

/**
 * Import media from a local file path within the WordPress container
 * The file must exist in the container (e.g., uploaded via flux-files API first)
 *
 * @param filePath - Path to the file inside the container (e.g., /var/www/html/wp-content/uploads/temp/image.jpg)
 * @param options - Optional metadata (title, alt, caption, etc.)
 * @returns Attachment ID on success
 */
export async function importMedia(
  zelidauth: string,
  params: WPCliExecParams,
  filePath: string,
  options: MediaImportOptions = {},
  skipCopy: boolean = false
): Promise<WPCliResponse<string>> {
  const cmdOptions = buildMediaImportOptions(options);
  cmdOptions.push('--porcelain'); // Return just the attachment ID

  // If file is already in uploads directory, use --skip-copy to avoid re-copying
  // This also bypasses some of the MIME type validation
  if (skipCopy) {
    cmdOptions.push('--skip-copy');
  }

  const cmd = buildWpCommand('media import', [`'${filePath}'`, ...cmdOptions]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Import media from an external URL
 * WordPress will download the file and add it to the media library
 *
 * @param url - Public URL of the media file to import
 * @param options - Optional metadata (title, alt, caption, etc.)
 * @returns Attachment ID on success
 */
export async function importMediaFromUrl(
  zelidauth: string,
  params: WPCliExecParams,
  url: string,
  options: MediaImportOptions = {}
): Promise<WPCliResponse<string>> {
  const cmdOptions = buildMediaImportOptions(options);
  cmdOptions.push('--porcelain'); // Return just the attachment ID

  // URL doesn't need escaping the same way, but we should validate it
  const cmd = buildWpCommand('media import', [`'${url}'`, ...cmdOptions]);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * List all media items in the WordPress media library
 */
export async function listMedia(
  zelidauth: string,
  params: WPCliExecParams
): Promise<WPCliResponse<WPMedia[]>> {
  const cmd = buildWpJsonCommand('post list', ['--post_type=attachment', '--fields=ID,post_title,post_name,post_mime_type,post_date,guid']);
  return executeWpCommand<WPMedia[]>(zelidauth, params, cmd);
}

/**
 * Get a single media item by attachment ID
 */
export async function getMedia(
  zelidauth: string,
  params: WPCliExecParams,
  attachmentId: string
): Promise<WPCliResponse<WPMedia>> {
  const cmd = buildWpJsonCommand('post get', [attachmentId, '--fields=ID,post_title,post_name,post_mime_type,post_date,guid']);
  return executeWpCommand<WPMedia>(zelidauth, params, cmd);
}

/**
 * Delete a media item from the WordPress media library
 * This also deletes the physical file from the uploads directory
 *
 * @param attachmentId - The attachment post ID to delete
 */
export async function deleteMedia(
  zelidauth: string,
  params: WPCliExecParams,
  attachmentId: string
): Promise<WPCliResponse<string>> {
  const cmd = buildWpCommand('post delete', [attachmentId, '--force']);
  return executeWpCommand<string>(zelidauth, params, cmd);
}

/**
 * Regenerate thumbnails for all images or a specific attachment
 *
 * @param attachmentId - Optional specific attachment ID, or regenerate all if not provided
 */
export async function regenerateThumbnails(
  zelidauth: string,
  params: WPCliExecParams,
  attachmentId?: string
): Promise<WPCliResponse<string>> {
  const options = attachmentId ? [attachmentId] : ['--yes'];
  const cmd = buildWpCommand('media regenerate', options);
  return executeWpCommand<string>(zelidauth, params, cmd);
}
