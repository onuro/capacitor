"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { isSameNodeIp } from "@/lib/utils";
import type { DirectoryListing } from "@/lib/api/flux-files";

const MAX_NODES_TO_TRY = 5;

export interface UseFileOperationsOptions {
  appName: string;
  component: string;
  nodeIps: string[];
  masterNodeAddress: string | null;
  zelidauth: string;
  onNodeSwitch?: (nodeIp: string, reason: string) => void;
}

export interface UseFileOperationsResult {
  /** The node currently being used for file operations */
  activeNode: string | null;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Last error message */
  error: string | null;
  /** List files in a folder */
  listFiles: (folder: string) => Promise<DirectoryListing | null>;
  /** Download/read a file */
  downloadFile: (filePath: string) => Promise<string | null>;
  /** Save/upload file content */
  saveFile: (filePath: string, content: string) => Promise<boolean>;
  /** Upload a binary file */
  uploadBinaryFile: (folder: string, file: File) => Promise<boolean>;
  /** Delete a file or folder */
  deleteFile: (filePath: string) => Promise<boolean>;
  /** Manually set the active node */
  setActiveNode: (nodeIp: string) => void;
  /** Reset to try master node again */
  resetToMaster: () => void;
  /** Retry the last failed operation */
  retry: () => void;
}

interface ApiResponse<T> {
  status: "success" | "error";
  data?: T;
  message?: string;
  nodeIp?: string;
}

/**
 * Hook for file operations with automatic node fallback.
 * Similar to how the official FluxOS frontend handles node selection.
 */
export function useFileOperations({
  appName,
  component,
  nodeIps,
  masterNodeAddress,
  zelidauth,
  onNodeSwitch,
}: UseFileOperationsOptions): UseFileOperationsResult {
  const [activeNode, setActiveNodeState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastOperationRef = useRef<(() => Promise<unknown>) | null>(null);

  // Order nodes: master first, then others (up to MAX_NODES_TO_TRY)
  const orderedNodes = useMemo(() => {
    if (nodeIps.length === 0) return [];

    let nodes = [...nodeIps];

    // If we have a master, put it first
    if (masterNodeAddress) {
      const masterNode = nodeIps.find((ip) =>
        isSameNodeIp(ip, masterNodeAddress),
      );
      if (masterNode) {
        nodes = [masterNode, ...nodeIps.filter((ip) => ip !== masterNode)];
      }
    }

    return nodes.slice(0, MAX_NODES_TO_TRY);
  }, [nodeIps, masterNodeAddress]);

  // Set active node to first available if not set
  const getStartingNode = useCallback(() => {
    if (activeNode && orderedNodes.includes(activeNode)) {
      return activeNode;
    }
    return orderedNodes[0] || null;
  }, [activeNode, orderedNodes]);

  // Manually set active node
  const setActiveNode = useCallback((nodeIp: string) => {
    setActiveNodeState(nodeIp);
    setError(null);
  }, []);

  // Reset to master node
  const resetToMaster = useCallback(() => {
    if (orderedNodes.length > 0) {
      setActiveNodeState(orderedNodes[0]);
      setError(null);
    }
  }, [orderedNodes]);

  /**
   * Execute an operation with automatic fallback to other nodes on failure.
   */
  const executeWithFallback = useCallback(
    async <T>(
      operation: (nodeIp: string) => Promise<ApiResponse<T>>,
      operationName: string,
    ): Promise<T | null> => {
      const startNode = getStartingNode();
      if (!startNode) {
        setError("No nodes available");
        return null;
      }

      // Build list of nodes to try, starting from active node
      const startIndex = orderedNodes.indexOf(startNode);
      const nodesToTry =
        startIndex > 0
          ? [
              ...orderedNodes.slice(startIndex),
              ...orderedNodes.slice(0, startIndex),
            ]
          : orderedNodes;

      let lastError = "";
      let triedNodes = 0;

      for (const nodeIp of nodesToTry) {
        triedNodes++;
        try {
          console.log(
            `[FileOps] ${operationName}: Trying ${nodeIp} (${triedNodes}/${nodesToTry.length})`,
          );

          const result = await operation(nodeIp);

          if (result.status === "success" && result.data !== undefined) {
            // Success - update active node if changed
            if (nodeIp !== activeNode) {
              setActiveNodeState(nodeIp);
              if (activeNode) {
                // Only show toast if we actually switched from a different node
                const reason = lastError || "previous node failed";
                toast.info(`Switched to node ${nodeIp.split(":")[0]}`, {
                  description: reason,
                });
                onNodeSwitch?.(nodeIp, reason);
              }
            }
            setError(null);
            return result.data;
          }

          // Node returned error
          lastError = result.message || "Unknown error";
          console.log(
            `[FileOps] ${operationName}: ${nodeIp} failed: ${lastError}`,
          );
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Connection failed";
          console.log(
            `[FileOps] ${operationName}: ${nodeIp} exception: ${lastError}`,
          );
        }
      }

      // All nodes failed
      setError(lastError);
      toast.error(`${operationName} failed`, {
        description: `All ${triedNodes} nodes failed. Last error: ${lastError}`,
      });
      return null;
    },
    [activeNode, orderedNodes, getStartingNode, onNodeSwitch],
  );

  /**
   * List files in a folder
   */
  const listFiles = useCallback(
    async (folder: string): Promise<DirectoryListing | null> => {
      setIsLoading(true);
      lastOperationRef.current = () => listFiles(folder);

      try {
        return await executeWithFallback(async (nodeIp) => {
          const params = new URLSearchParams({
            nodeIp,
            appName,
            component,
            folder,
          });

          const response = await fetch(`/api/flux/files?${params.toString()}`, {
            method: "GET",
            headers: { zelidauth },
            signal: AbortSignal.timeout(15000),
          });

          return response.json();
        }, "List files");
      } finally {
        setIsLoading(false);
      }
    },
    [appName, component, zelidauth, executeWithFallback],
  );

  /**
   * Download/read a file
   */
  const downloadFile = useCallback(
    async (filePath: string): Promise<string | null> => {
      setIsLoading(true);
      lastOperationRef.current = () => downloadFile(filePath);

      try {
        return await executeWithFallback(async (nodeIp) => {
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
        }, "Download file");
      } finally {
        setIsLoading(false);
      }
    },
    [appName, component, zelidauth, executeWithFallback],
  );

  /**
   * Save/upload file content
   */
  const saveFile = useCallback(
    async (filePath: string, content: string): Promise<boolean> => {
      setIsLoading(true);
      lastOperationRef.current = () => saveFile(filePath, content);

      try {
        const result = await executeWithFallback(async (nodeIp) => {
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

          const data = await response.json();
          // For save operations, we just need success status
          return {
            ...data,
            data: data.status === "success" ? true : undefined,
          };
        }, "Save file");

        return result === true;
      } finally {
        setIsLoading(false);
      }
    },
    [appName, component, zelidauth, executeWithFallback],
  );

  /**
   * Upload a binary file
   */
  const uploadBinaryFile = useCallback(
    async (folder: string, file: File): Promise<boolean> => {
      setIsLoading(true);
      lastOperationRef.current = () => uploadBinaryFile(folder, file);

      try {
        const result = await executeWithFallback(async (nodeIp) => {
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
              headers: { zelidauth },
              body: formData,
              signal: AbortSignal.timeout(120000),
            },
          );

          const data = await response.json();
          return {
            ...data,
            data: data.status === "success" ? true : undefined,
          };
        }, "Upload file");

        return result === true;
      } finally {
        setIsLoading(false);
      }
    },
    [appName, component, zelidauth, executeWithFallback],
  );

  /**
   * Delete a file or folder
   */
  const deleteFile = useCallback(
    async (filePath: string): Promise<boolean> => {
      setIsLoading(true);
      lastOperationRef.current = () => deleteFile(filePath);

      try {
        const result = await executeWithFallback(async (nodeIp) => {
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

          const data = await response.json();
          return {
            ...data,
            data: data.status === "success" ? true : undefined,
          };
        }, "Delete");

        return result === true;
      } finally {
        setIsLoading(false);
      }
    },
    [appName, component, zelidauth, executeWithFallback],
  );

  /**
   * Retry the last failed operation
   */
  const retry = useCallback(() => {
    if (lastOperationRef.current) {
      lastOperationRef.current();
    }
  }, []);

  return {
    activeNode: activeNode || getStartingNode(),
    isLoading,
    error,
    listFiles,
    downloadFile,
    saveFile,
    uploadBinaryFile,
    deleteFile,
    setActiveNode,
    resetToMaster,
    retry,
  };
}
