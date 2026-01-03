# Flux Dev Skill

A Claude Code skill for developing on the Flux decentralized cloud platform.

## Description

This skill provides guidance and tools for developing Capacitor, a Next.js frontend application for managing Flux apps. The project uses:

- **Next.js 14+** - App Router with API routes as CORS proxies
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library built on Radix UI
- **TanStack Query (React Query)** - Data fetching and caching
- **Zustand** - State management for auth and app state

The skill helps with Flux-specific development tasks including app specification creation, API integration, and deployment management.

## Instructions

When the user invokes this skill, help them with Flux-specific development tasks:

### App Specification (V8 Format)

Flux apps use a V8 specification format. When creating or modifying app specs:

```typescript
interface AppSpec {
  version: 8;
  name: string;              // Lowercase, alphanumeric, 3-30 chars
  description: string;       // Max 256 chars
  owner: string;             // Zel ID (public address)
  contacts: string[];        // Email contacts
  instances: number;         // 3-100 instances
  staticip: false;
  enterprise: '';
  nodes: [];
  geolocation: [];
  expire: number;            // Block height for expiration
  compose: ComponentSpec[];  // Container configurations
}

interface ComponentSpec {
  name: string;
  description: string;
  repotag: string;           // Docker image (e.g., "nginx:latest")
  ports: number[];           // External ports
  containerPorts: number[];  // Container ports (maps 1:1 with ports)
  domains: string[];         // Custom domains
  environmentParameters: string[];  // ["KEY=value", ...]
  commands: string[];        // Container commands
  containerData: string;     // Persistent storage path
  cpu: number;               // 0.1-15 cores
  ram: number;               // 100-65536 MB
  hdd: number;               // 1-820 GB
  repoauth: string;          // Private registry auth (base64)
  tiered: false;
}
```

### Key API Endpoints

Base URL: `https://api.runonflux.io` (global) or `http://{nodeIp}:16127` (direct to node)

#### App Registration & Deployment
- `POST /apps/verifyappregistrationspecifications` - Validate app spec
- `POST /apps/calculatefiatandfluxprice` - Get pricing
- `POST /apps/appregister` - Register new app
- `GET /apps/deploymentinformation` - Get payment address

#### App Management
- `GET /apps/globalappsspecifications` - List all apps
- `GET /apps/appspecifications/{name}` - Get app spec
- `GET /apps/installedapps/{name}` - Get full spec with compose details
- `GET /apps/applocations/{name}` - Get running locations
- `GET /apps/listrunningapps` - List running apps
- `POST /apps/appstart` - Start app (body: `{appname}`)
- `POST /apps/appstop` - Stop app (body: `{appname}`)
- `POST /apps/apprestart` - Restart app (body: `{appname}`)

#### Monitoring & Logs
- `GET /apps/applog/{containerName}/{lines}` - Get app logs
- `GET /apps/appstats/{containerName}` - Get Docker stats (raw)

**IMPORTANT**: Container names follow the format `{componentName}_{appName}` (e.g., `wp_wordpress123`)

#### Command Execution

**REST Endpoint (BROKEN - DO NOT USE)**
- `POST /apps/appexec` - Executes command in container (has timeout bug, hangs indefinitely)

**Socket.io Method (RECOMMENDED)**

Use socket.io to connect to the node's terminal namespace for reliable command execution:

```typescript
// Socket URL format
const [host, port = '16127'] = nodeIp.split(':');
const dashedHost = host.replace(/\./g, '-');
const socketUrl = `https://${dashedHost}-${port}.node.api.runonflux.io`;

// Connect to terminal namespace
const socket = io(socketUrl + '/terminal', {
  transports: ['websocket', 'polling'],
  timeout: 10000,
  reconnection: false,
});

// Execute command
socket.on('connect', () => {
  // Start shell: exec(zelidauth, containerName, cmd, env, user)
  socket.emit('exec', authString, 'wp_appName', '/bin/sh', '', '');

  // After shell starts, send command
  setTimeout(() => {
    socket.emit('cmd', 'wp plugin list --allow-root --format=json && exit 0\n');
  }, 500);
});

// Receive output
socket.on('show', (data: string) => {
  // Accumulate output, wait for 3s of silence to determine completion
});
```

The project has a Next.js API proxy at `/api/flux/exec-socket` that handles this.

#### File System (Direct to Node)

These endpoints must be called directly on Flux nodes (CORS issues from browser):

- `GET /apps/getfolderinfo/{appname}/{component}/{folder}` - List directory
  - `folder` must be URL-encoded (e.g., `appdata%2Fwp-content`)

- `GET /apps/downloadfile/{appname}/{component}/{file}` - Download file
  - `file` path must be URL-encoded (e.g., `appdata%2Findex.php`)

- `POST /ioutils/fileupload/volume/{appname}/{component}/{folder}` - Upload file
  - `folder` must be URL-encoded
  - File content sent as multipart FormData with filename as key

### Authentication

Flux uses `zelidauth` header for authenticated requests.

**Frontend format** (stored in app):
```
zelidauth: {zelid}:{signature}:{loginPhrase}
```

**Node format** (what Flux nodes expect):
```typescript
const authObj = {
  zelid: parts[0],
  signature: parts[1],
  loginPhrase: parts.slice(2).join(':'),
};
headers['zelidauth'] = JSON.stringify(authObj);
```

### Master Node Detection & Selection

Flux apps run on multiple nodes. The codebase uses a centralized approach for node selection with HAProxy-based master detection.

#### Centralized Node Picker Component

The `NodePicker` component (`components/apps/node-picker.tsx`) provides unified node selection across all features:

```typescript
import { NodePicker, useResolvedNode } from '@/components/apps/node-picker';

// In a page component - uses controlled "auto" | "IP:port" value
const [selectedNode, setSelectedNode] = useState<string>('auto');

<NodePicker
  appName={appName}
  value={selectedNode}
  onChange={setSelectedNode}
  size="sm" // or "default"
/>

// In child components - resolve "auto" to actual node IP
const { resolvedNode, isMaster, isLoading } = useResolvedNode(appName, selectedNode);
```

#### useNodeSelection Hook

The core hook (`hooks/use-node-selection.ts`) handles:
- Fetching app locations
- Sorting by broadcastedAt (with 5s clock skew tolerance)
- Master node detection via HAProxy
- Providing node labels ("master" indicator)

```typescript
import { useNodeSelection } from '@/hooks/use-node-selection';

const {
  selectedNode,      // Current selection (IP:port)
  setSelectedNode,   // Setter
  sortedLocations,   // Sorted AppLocation[]
  masterNodeAddress, // Master IP:port from HAProxy (or null)
  isLoading,
  getNodeLabel,      // Returns "(master)" for master node
} = useNodeSelection({ appName, autoSelectMaster: true });
```

#### HAProxy Master Detection

Master node is detected via HAProxy statistics (`/fluxstatistics`). The active server has `act=1`:

```typescript
// API endpoint: /api/flux/master-node?appName=myapp
// Returns: { status: 'success', data: { masterIp: '1.2.3.4:16127', appName, source: 'haproxy' } }

import { getMasterNode } from '@/lib/api/flux-node-detect';

const response = await getMasterNode(appName);
if (response.status === 'success') {
  const masterIp = response.data.masterIp; // e.g., "65.108.105.29:16177"
}
```

#### Node Address Formatting

Use `formatNodeAddress` utility to convert AppLocation to IP:port string:

```typescript
import { formatNodeAddress } from '@/lib/utils';

// Handles cases where loc.ip might already include port
// Falls back to loc.port or default 16127
const ipPort = formatNodeAddress(location); // "1.2.3.4:16127"
```

#### Legacy: Manual Sorting Approach

For cases without HAProxy, sort by broadcastedAt (earliest first), IP as tiebreaker:

```typescript
const sortedLocations = [...locations].sort((a, b) => {
  const timeA = new Date(a.broadcastedAt).getTime();
  const timeB = new Date(b.broadcastedAt).getTime();
  const timeDiff = timeA - timeB;
  // 5-second clock skew tolerance
  if (Math.abs(timeDiff) <= 5000) {
    return a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0;
  }
  return timeDiff;
});
const primaryNode = sortedLocations[0];
```

### Important Notes

1. **Node Selection Pattern**: The app detail page uses a controlled `selectedNode` state with "auto" as default. Child components (MetricsDashboard, LogViewer, FileBrowser, WPCliDashboard) receive `selectedNode` as prop and use `useResolvedNode(appName, selectedNode)` to resolve "auto" to actual node IP.

2. **CORS**: Browser requests to Flux nodes are blocked by CORS. Use Next.js API routes as proxies.

3. **POST Body Format**: Some POST endpoints need stringified JSON with `Content-Type: text/plain`
   ```typescript
   await axios.post(url, JSON.stringify(data), {
     headers: { 'Content-Type': 'text/plain' }
   });
   ```

4. **Node Ports**: Standard port is 16127, but nodes may have custom ports (e.g., `65.108.105.29:16177`)

5. **URL Encoding**: File/folder paths must be URL-encoded as single parameters, NOT as path segments
   - Wrong: `/apps/downloadfile/myapp/main/folder/file.txt`
   - Correct: `/apps/downloadfile/myapp/main/folder%2Ffile.txt`

6. **App Names**: Must be lowercase, alphanumeric only, 3-30 characters

7. **Legacy Apps**: Apps with version <= 3 don't have compose array; use app name as component

8. **Upload Response**: File upload returns streaming progress data, not JSON. Check HTTP status for success.

### WordPress/WP-CLI Integration

The project includes a full WordPress management dashboard for FluxCloud WordPress apps (`runonflux/wp-nginx:latest`).

#### WordPress Detection

```typescript
function isWordPressApp(app: FluxApp): boolean {
  return app.compose?.some(c => c.repotag.includes('runonflux/wp-nginx')) ?? false;
}
```

#### WP-CLI Commands

WP-CLI runs in the `wp` component of WordPress apps. Commands must:
- Run from `/var/www/html` (WordPress installation directory)
- Include `--allow-root` flag (container runs as root)
- Use `--format=json` for parseable output

```typescript
// Build WP-CLI command
function buildWpCommand(subcommand: string, options: string[] = []): string {
  const wpCommand = ['wp', subcommand, ...options, '--allow-root'].join(' ');
  return `cd /var/www/html && ${wpCommand}`;
}

// Example: List plugins
const cmd = 'cd /var/www/html && wp plugin list --allow-root --format=json';
```

#### Available WP-CLI Functions

**Plugins** (`lib/api/flux-wp-cli.ts`):
- `listPlugins()` - Get all installed plugins with status
- `installPlugin(slug)` - Install from WordPress.org
- `activatePlugin(slug)` / `deactivatePlugin(slug)`
- `updatePlugin(slug)` / `deletePlugin(slug)`

**Themes**:
- `listThemes()` - Get all installed themes
- `installTheme(slug)` / `activateTheme(slug)` / `deleteTheme(slug)`

**Users**:
- `listUsers()` - Get all WordPress users
- `createUser(userData)` - Create new user with role
- `resetUserPassword(userId, newPassword)`
- `deleteUser(userId)`

**Error Logs**:
- `getErrorLog(logType, lines)` - Fetch PHP/Nginx/WordPress logs
- `clearErrorLog(logType)` - Truncate log file

#### Log File Locations (FluxCloud WordPress)

```typescript
export const LOG_PATHS = {
  php: '/var/log/php-fpm-error.log',      // PHP-FPM errors
  nginx: '/var/log/nginx/error.log',       // Nginx errors
  wordpress: '/var/www/html/wp-content/debug.log', // WP debug (if enabled)
};
```

#### WordPress Dashboard Components

Located in `components/apps/wp-cli/`:
- `index.tsx` - Main dashboard with node selector and tabs
- `plugin-manager.tsx` - Plugin install/activate/update/delete UI
- `theme-manager.tsx` - Theme management UI
- `user-manager.tsx` - User creation and password reset
- `error-logs.tsx` - Log viewer with search, download, clear
- `wp-detection.ts` - WordPress app detection utility

### Project Structure

This Capacitor project has Flux APIs in:

#### Client-side API functions
- `lib/api/flux-apps.ts` - App lifecycle (start/stop/restart, locations, specs)
- `lib/api/flux-logs.ts` - Log fetching
- `lib/api/flux-metrics.ts` - Performance metrics
- `lib/api/flux-files.ts` - File operations (listFiles, downloadFile, saveFile)
- `lib/api/flux-wp-cli.ts` - WP-CLI commands (plugins, themes, users, error logs)
- `lib/api/flux-node-detect.ts` - Master node detection (HAProxy), serving node detection
- `lib/api/apps.ts` - Registration APIs
- `lib/api/client.ts` - Base axios client with auth

#### Hooks
- `hooks/use-node-selection.ts` - Unified node selection with master detection

#### Next.js API Proxies (to avoid CORS)
- `app/api/flux/stats/route.ts` - Proxy for container stats
- `app/api/flux/files/route.ts` - Proxy for directory listing
- `app/api/flux/files/download/route.ts` - Proxy for file download
- `app/api/flux/files/upload/route.ts` - Proxy for file upload
- `app/api/flux/files/delete/route.ts` - Proxy for file deletion
- `app/api/flux/exec-socket/route.ts` - Socket.io exec proxy (for WP-CLI commands)
- `app/api/flux/master-node/route.ts` - HAProxy-based master node detection
- `app/api/flux/detect-node/route.ts` - Detect serving node via FDMSERVERID cookie
- `app/api/flux/logs/route.ts` - Proxy for container logs

#### Components
- `components/apps/app-card.tsx` - App summary card
- `components/apps/node-picker.tsx` - Centralized node selector with "auto" mode
- `components/apps/lifecycle-controls.tsx` - Start/stop/restart buttons
- `components/apps/log-viewer.tsx` - Real-time log display
- `components/apps/metrics-dashboard.tsx` - CPU/RAM/Network stats
- `components/apps/file-browser.tsx` - File manager with view/edit capabilities
- `components/apps/wp-cli/` - WordPress management dashboard
  - `index.tsx` - Main dashboard with sub-tabs
  - `plugin-manager.tsx` - Plugin management UI
  - `theme-manager.tsx` - Theme management UI
  - `user-manager.tsx` - User management UI
  - `error-logs.tsx` - Error log viewer (PHP/Nginx/WP)
  - `wp-detection.ts` - WordPress app detection
  - `types.ts` - TypeScript interfaces

### Common Tasks

**Get app stats from a specific node:**
```typescript
// Container name format: componentName_appName
const containerName = `${component}_${appName}`;
const response = await fetch(
  `http://${nodeIp}:16127/apps/appstats/${containerName}`,
  { headers: { zelidauth: JSON.stringify(authObj) } }
);
```

**List files in app storage:**
```typescript
const folder = 'appdata/wp-content';
const response = await fetch(
  `http://${nodeIp}:16127/apps/getfolderinfo/${appName}/${component}/${encodeURIComponent(folder)}`,
  { headers: { zelidauth: JSON.stringify(authObj) } }
);
```

**Download a file:**
```typescript
const filePath = 'appdata/config.php';
const response = await fetch(
  `http://${nodeIp}:16127/apps/downloadfile/${appName}/${component}/${encodeURIComponent(filePath)}`,
  { headers: { zelidauth: JSON.stringify(authObj) } }
);
const content = await response.text();
```

**Upload/save a file:**
```typescript
const folder = 'appdata';
const filename = 'config.php';
const formData = new FormData();
formData.append(filename, new Blob([content], { type: 'text/plain' }));

await fetch(
  `http://${nodeIp}:16127/ioutils/fileupload/volume/${appName}/${component}/${encodeURIComponent(folder)}`,
  {
    method: 'POST',
    headers: { zelidauth: JSON.stringify(authObj) },
    body: formData,
  }
);
// Success = HTTP 2xx (response is streaming progress, not JSON)
```

**Create a new app spec:**
```typescript
const appSpec: AppSpec = {
  version: 8,
  name: 'myapp',
  description: 'My Flux App',
  owner: zelid,
  contacts: ['email@example.com'],
  instances: 3,
  staticip: false,
  enterprise: '',
  nodes: [],
  geolocation: [],
  expire: currentHeight + 88000,
  compose: [{
    name: 'main',
    description: 'Main container',
    repotag: 'nginx:latest',
    ports: [80],
    containerPorts: [80],
    domains: [],
    environmentParameters: [],
    commands: [],
    containerData: '/data',
    cpu: 0.5,
    ram: 256,
    hdd: 5,
    repoauth: '',
    tiered: false,
  }],
};
```

## Trigger

- `/flux-dev` - Activate Flux development assistant
- When user asks about Flux app deployment
- When user asks about FluxOS or FluxCloud
- When user works with app specifications

## Files

Key files for Flux integration:
- [lib/api/flux-apps.ts](lib/api/flux-apps.ts)
- [lib/api/flux-logs.ts](lib/api/flux-logs.ts)
- [lib/api/flux-metrics.ts](lib/api/flux-metrics.ts)
- [lib/api/flux-files.ts](lib/api/flux-files.ts)
- [lib/api/flux-wp-cli.ts](lib/api/flux-wp-cli.ts) - WP-CLI API client
- [lib/api/flux-node-detect.ts](lib/api/flux-node-detect.ts) - Master/serving node detection
- [lib/api/apps.ts](lib/api/apps.ts)
- [lib/types/app-spec.ts](lib/types/app-spec.ts)
- [lib/utils.ts](lib/utils.ts) - formatNodeAddress utility
- [hooks/use-node-selection.ts](hooks/use-node-selection.ts) - Centralized node selection hook
- [app/api/flux/](app/api/flux/) - Next.js API proxies
- [app/api/flux/master-node/route.ts](app/api/flux/master-node/route.ts) - HAProxy master detection
- [app/api/flux/exec-socket/route.ts](app/api/flux/exec-socket/route.ts) - Socket.io exec
- [components/apps/](components/apps/) - UI components
- [components/apps/node-picker.tsx](components/apps/node-picker.tsx) - Centralized node picker
- [components/apps/wp-cli/](components/apps/wp-cli/) - WordPress management dashboard
