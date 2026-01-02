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

### Primary Node Detection

Flux apps run on multiple nodes. To deterministically select a "primary" node (like Syncthing leader election):

```typescript
// Sort by broadcastedAt (earliest first), IP as tiebreaker
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

1. **CORS**: Browser requests to Flux nodes are blocked by CORS. Use Next.js API routes as proxies.

2. **POST Body Format**: Some POST endpoints need stringified JSON with `Content-Type: text/plain`
   ```typescript
   await axios.post(url, JSON.stringify(data), {
     headers: { 'Content-Type': 'text/plain' }
   });
   ```

3. **Node Ports**: Standard port is 16127, but nodes may have custom ports (e.g., `65.108.105.29:16177`)

4. **URL Encoding**: File/folder paths must be URL-encoded as single parameters, NOT as path segments
   - Wrong: `/apps/downloadfile/myapp/main/folder/file.txt`
   - Correct: `/apps/downloadfile/myapp/main/folder%2Ffile.txt`

5. **App Names**: Must be lowercase, alphanumeric only, 3-30 characters

6. **Legacy Apps**: Apps with version <= 3 don't have compose array; use app name as component

7. **Upload Response**: File upload returns streaming progress data, not JSON. Check HTTP status for success.

### Project Structure

This Capacitor project has Flux APIs in:

#### Client-side API functions
- `lib/api/flux-apps.ts` - App lifecycle (start/stop/restart, locations, specs)
- `lib/api/flux-logs.ts` - Log fetching
- `lib/api/flux-metrics.ts` - Performance metrics
- `lib/api/flux-files.ts` - File operations (listFiles, downloadFile, saveFile)
- `lib/api/apps.ts` - Registration APIs
- `lib/api/client.ts` - Base axios client with auth

#### Next.js API Proxies (to avoid CORS)
- `app/api/flux/stats/route.ts` - Proxy for container stats
- `app/api/flux/files/route.ts` - Proxy for directory listing
- `app/api/flux/files/download/route.ts` - Proxy for file download
- `app/api/flux/files/upload/route.ts` - Proxy for file upload

#### Components
- `components/apps/app-card.tsx` - App summary card
- `components/apps/lifecycle-controls.tsx` - Start/stop/restart buttons
- `components/apps/log-viewer.tsx` - Real-time log display
- `components/apps/metrics-dashboard.tsx` - CPU/RAM/Network stats with node selector
- `components/apps/file-browser.tsx` - File manager with view/edit capabilities

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
- [lib/api/apps.ts](lib/api/apps.ts)
- [lib/types/app-spec.ts](lib/types/app-spec.ts)
- [app/api/flux/](app/api/flux/) - Next.js API proxies
- [components/apps/](components/apps/) - UI components
