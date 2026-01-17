import apiClient from "./client";

export interface FluxApiResponse<T> {
  status: "success" | "error";
  data?: T;
  message?: string;
}

export interface FileInfo {
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  permissions: string;
}

export interface DirectoryListing {
  path: string;
  files: FileInfo[];
}

/**
 * List files in app storage (via proxy to handle CORS)
 * @param zelidauth - Auth token
 * @param appName - Name of the application
 * @param component - Component name (for compose apps)
 * @param nodeIp - Node IP to query
 * @param path - Path within the app storage (default: root)
 */
export async function listFiles(
  zelidauth: string,
  appName: string,
  component: string,
  nodeIp: string,
  path: string = "/",
): Promise<FluxApiResponse<DirectoryListing>> {
  const params = new URLSearchParams({
    nodeIp,
    appName,
    component,
    folder: path,
  });

  const response = await fetch(`/api/flux/files?${params.toString()}`, {
    method: "GET",
    headers: { zelidauth },
    signal: AbortSignal.timeout(30000),
  });

  return response.json();
}

/**
 * Download a file from app storage (via proxy)
 * @param zelidauth - Auth token
 * @param appName - Name of the application
 * @param component - Component name
 * @param nodeIp - Node IP
 * @param filePath - Path to the file
 */
export async function downloadFile(
  zelidauth: string,
  appName: string,
  component: string,
  nodeIp: string,
  filePath: string,
): Promise<FluxApiResponse<string>> {
  const params = new URLSearchParams({
    nodeIp,
    appName,
    component,
    filePath,
  });

  const response = await fetch(
    `/api/flux/files/download?${params.toString()}`,
    {
      method: "GET",
      headers: { zelidauth },
      signal: AbortSignal.timeout(60000),
    },
  );

  return response.json();
}

/**
 * Upload/save a file to app storage (via proxy)
 * @param zelidauth - Auth token
 * @param appName - Name of the application
 * @param component - Component name
 * @param nodeIp - Node IP
 * @param filePath - Path to the file
 * @param content - File content
 */
export async function saveFile(
  zelidauth: string,
  appName: string,
  component: string,
  nodeIp: string,
  filePath: string,
  content: string,
): Promise<FluxApiResponse<string>> {
  const response = await fetch("/api/flux/files/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      zelidauth,
    },
    body: JSON.stringify({
      nodeIp,
      appName,
      component,
      filePath,
      content,
    }),
    signal: AbortSignal.timeout(60000),
  });

  return response.json();
}

/**
 * Upload a file to app storage
 * @param appName - Name of the application
 * @param filePath - Destination path
 * @param file - File to upload
 */
export async function uploadFile(
  zelidauth: string,
  appName: string,
  filePath: string,
  file: File,
): Promise<FluxApiResponse<string>> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", filePath);

  const response = await apiClient.post<FluxApiResponse<string>>(
    `/apps/appfileupload/${appName}`,
    formData,
    {
      headers: {
        zelidauth,
        "Content-Type": "multipart/form-data",
      },
      timeout: 120000,
    },
  );
  return response.data;
}

/**
 * Upload a binary file to app storage (via proxy with master node detection)
 * @param zelidauth - Auth token
 * @param appName - Name of the application
 * @param component - Component name
 * @param nodeIp - Node IP
 * @param folder - Destination folder path
 * @param file - File to upload
 */
export async function uploadBinaryFile(
  zelidauth: string,
  appName: string,
  component: string,
  nodeIp: string,
  folder: string,
  file: File,
): Promise<FluxApiResponse<string>> {
  const formData = new FormData();
  formData.append(file.name, file);

  const params = new URLSearchParams({
    nodeIp,
    appName,
    component,
    folder,
  });

  const response = await fetch(
    `/api/flux/files/upload-binary?${params.toString()}`,
    {
      method: "POST",
      headers: {
        zelidauth,
      },
      body: formData,
      signal: AbortSignal.timeout(120000),
    },
  );

  return response.json();
}

/**
 * Delete a file or folder from app storage (via proxy)
 * Uses Flux's removeobject endpoint which handles recursive folder deletion
 * @param zelidauth - Auth token
 * @param appName - Name of the application
 * @param component - Component name
 * @param nodeIp - Node IP
 * @param filePath - Path to the file or folder to delete
 */
export async function deleteFile(
  zelidauth: string,
  appName: string,
  component: string,
  nodeIp: string,
  filePath: string,
): Promise<FluxApiResponse<string>> {
  const response = await fetch("/api/flux/files/delete", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      zelidauth,
    },
    body: JSON.stringify({
      nodeIp,
      appName,
      component,
      filePath,
    }),
    signal: AbortSignal.timeout(60000),
  });

  return response.json();
}

/**
 * Get file content as text (for small text files)
 */
export async function getFileContent(
  zelidauth: string,
  appName: string,
  component: string,
  nodeIp: string,
  filePath: string,
): Promise<string> {
  const response = await downloadFile(
    zelidauth,
    appName,
    component,
    nodeIp,
    filePath,
  );
  if (response.status === "success" && response.data) {
    return response.data;
  }
  throw new Error(response.message || "Failed to get file content");
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
}

/**
 * Check if file is viewable as text
 */
export function isTextFile(filename: string): boolean {
  const textExtensions = [
    "txt",
    "md",
    "json",
    "yaml",
    "yml",
    "xml",
    "html",
    "css",
    "js",
    "ts",
    "jsx",
    "tsx",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "sh",
    "bash",
    "zsh",
    "env",
    "log",
    "conf",
    "cfg",
    "ini",
    "toml",
    "php",
    "htaccess",
    "sql",
    "vue",
    "svelte",
    "astro",
    "prisma",
    "graphql",
    "dockerfile",
    "makefile",
    "gitignore",
    "npmrc",
    "nvmrc",
    "editorconfig",
  ];
  return textExtensions.includes(getFileExtension(filename));
}

/**
 * Get appropriate icon for file type
 */
export function getFileIcon(file: FileInfo): string {
  if (file.isDirectory) return "folder";

  const ext = getFileExtension(file.name);
  const iconMap: Record<string, string> = {
    // Documents
    pdf: "file-text",
    doc: "file-text",
    docx: "file-text",
    txt: "file-text",
    md: "file-text",

    // Code
    js: "file-code",
    ts: "file-code",
    jsx: "file-code",
    tsx: "file-code",
    py: "file-code",
    go: "file-code",
    rs: "file-code",

    // Data
    json: "file-json",
    yaml: "file-json",
    yml: "file-json",
    xml: "file-code",

    // Images
    png: "image",
    jpg: "image",
    jpeg: "image",
    gif: "image",
    svg: "image",

    // Archives
    zip: "file-archive",
    tar: "file-archive",
    gz: "file-archive",

    // Config
    env: "settings",
    conf: "settings",
    cfg: "settings",
  };

  return iconMap[ext] || "file";
}
