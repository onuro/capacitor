"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAppLocations, type AppLocation } from "@/lib/api/flux-apps";
import { getMasterNode } from "@/lib/api/flux-node-detect";
import { formatNodeAddress, isSameNodeIp } from "@/lib/utils";

export interface UseNodeSelectionOptions {
  appName: string;
  /** Whether to auto-select the master node (default: true) */
  autoSelectMaster?: boolean;
}

export interface UseNodeSelectionResult {
  /** Currently selected node address (IP:port) */
  selectedNode: string;
  /** Set the selected node */
  setSelectedNode: (node: string) => void;
  /** Sorted list of locations */
  sortedLocations: AppLocation[];
  /** The master node address from FDM (if any) */
  masterNodeAddress: string | null;
  /** Whether locations are loading */
  isLoading: boolean;
  /** Get the label for a node (e.g., "(master)") */
  getNodeLabel: (loc: AppLocation, index: number) => string;
}

/**
 * Unified hook for node selection across all components.
 * Detects master node via HAProxy statistics (act=1 is master).
 */
export function useNodeSelection({
  appName,
  autoSelectMaster = true,
}: UseNodeSelectionOptions): UseNodeSelectionResult {
  const [selectedNode, setSelectedNode] = useState<string>("");

  // Fetch app locations
  const { data: locationsData, isLoading: locationsLoading } = useQuery({
    queryKey: ["appLocations", appName],
    queryFn: () => getAppLocations(appName),
    staleTime: 30000,
  });

  const locations = locationsData?.data || [];

  // Sort locations by broadcastedAt (earliest first)
  const sortedLocations = useMemo(() => {
    return [...locations].sort((a, b) => {
      const timeA = new Date(a.broadcastedAt).getTime();
      const timeB = new Date(b.broadcastedAt).getTime();
      const timeDiff = timeA - timeB;
      if (Math.abs(timeDiff) <= 5000) {
        return a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0;
      }
      return timeDiff;
    });
  }, [locations]);

  // Get master node from HAProxy stats (returns IP:port with correct Flux API port)
  const { data: masterNodeData, isLoading: masterLoading } = useQuery({
    queryKey: ["masterNode", appName],
    queryFn: () => getMasterNode(appName),
    enabled: !!appName,
    staleTime: 30000,
  });

  // HAProxy returns full IP:port with correct Flux API port
  const masterNodeAddress = masterNodeData?.data?.masterIp || null;

  // Auto-select node when locations load
  useEffect(() => {
    if (sortedLocations.length > 0 && !selectedNode) {
      if (autoSelectMaster && masterNodeAddress) {
        setSelectedNode(masterNodeAddress);
      } else {
        setSelectedNode(formatNodeAddress(sortedLocations[0]));
      }
    }
  }, [sortedLocations, selectedNode, masterNodeAddress, autoSelectMaster]);

  // Get label for a node - compare by IP only since ports may differ
  const getNodeLabel = (loc: AppLocation, _index: number): string => {
    const address = formatNodeAddress(loc);
    if (masterNodeAddress && isSameNodeIp(address, masterNodeAddress)) {
      return "(master)";
    }
    return "";
  };

  return {
    selectedNode,
    setSelectedNode,
    sortedLocations,
    masterNodeAddress,
    isLoading: locationsLoading || masterLoading,
    getNodeLabel,
  };
}
