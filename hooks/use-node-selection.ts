"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAppLocations, getAppClusterStatus, type AppLocation } from "@/lib/api/flux-apps";
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
 * Fetches cluster status to get correct Flux API ports for each node,
 * then enriches location data so all downstream consumers get correct IP:PORT.
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

  // Fetch cluster status for correct port mapping
  const { data: clusterData } = useQuery({
    queryKey: ["appClusterStatus", appName],
    queryFn: () => getAppClusterStatus(appName),
    enabled: !!appName,
    staleTime: 30000,
  });

  const portMap = clusterData?.data?.portMap || {};
  const clusterMasterIP = clusterData?.data?.masterIP || null;

  // Enrich locations with correct ports from cluster status, then sort
  const sortedLocations = useMemo(() => {
    const enriched = locations.map((loc) => {
      const bareIp = loc.ip.includes(":") ? loc.ip.split(":")[0] : loc.ip;
      const correctPort = portMap[bareIp];
      if (correctPort) {
        return { ...loc, port: correctPort };
      }
      return loc;
    });

    return enriched.sort((a, b) => {
      const timeA = new Date(a.broadcastedAt).getTime();
      const timeB = new Date(b.broadcastedAt).getTime();
      const timeDiff = timeA - timeB;
      if (Math.abs(timeDiff) <= 5000) {
        return a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0;
      }
      return timeDiff;
    });
  }, [locations, portMap]);

  // Get master node from FDM/HAProxy
  const { data: masterNodeData, isLoading: masterLoading } = useQuery({
    queryKey: ["masterNode", appName],
    queryFn: () => getMasterNode(appName),
    enabled: !!appName,
    staleTime: 30000,
  });

  // Derive master node address with correct port
  const masterNodeAddress = useMemo(() => {
    // Primary: use FDM master IP, but fix the port from cluster status
    const fdmMasterIp = masterNodeData?.data?.masterIp || null;
    if (fdmMasterIp) {
      const bareIp = fdmMasterIp.split(":")[0];
      const correctPort = portMap[bareIp];
      return correctPort ? `${bareIp}:${correctPort}` : fdmMasterIp;
    }

    // Fallback: use masterIP from cluster status
    if (clusterMasterIP) {
      const correctPort = portMap[clusterMasterIP];
      return correctPort ? `${clusterMasterIP}:${correctPort}` : null;
    }

    return null;
  }, [masterNodeData, portMap, clusterMasterIP]);

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
