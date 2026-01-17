"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Server } from "lucide-react";
import { useNodeSelection } from "@/hooks/use-node-selection";
import { formatNodeAddress, isSameNodeIp, cn } from "@/lib/utils";

export interface NodePickerProps {
  /** App name for fetching locations and master node */
  appName: string;
  /** Controlled value ("auto" | "IP:port") */
  value: string;
  /** Controlled onChange handler */
  onChange: (value: string) => void;
  /** Size variant */
  size?: "sm" | "default";
  /** Additional className */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

const sizeClasses = {
  sm: "h-8 text-xs",
  default: "h-9 text-sm",
};

/**
 * Unified node picker component for selecting Flux app instances.
 * Uses HAProxy/FDM to detect the master node.
 */
export function NodePicker({
  appName,
  value,
  onChange,
  size = "default",
  className,
  disabled = false,
}: NodePickerProps) {
  const { sortedLocations, masterNodeAddress, isLoading, getNodeLabel } =
    useNodeSelection({ appName, autoSelectMaster: false });

  // Don't render if no locations
  if (!isLoading && sortedLocations.length === 0) {
    return null;
  }

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={cn("w-[200px]", sizeClasses[size], className)}>
        <Server className="size-3.5 mr-1.5" />
        <SelectValue placeholder={isLoading ? "Loading..." : "Select node"} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="auto">
          Auto {masterNodeAddress ? "(master)" : "(first available)"}
        </SelectItem>
        {sortedLocations.map((loc, idx) => {
          const ipPort = formatNodeAddress(loc);
          const label = getNodeLabel(loc, idx);
          return (
            <SelectItem key={ipPort} value={ipPort}>
              {ipPort} {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * Hook to resolve "auto" selection to actual node IP.
 * Use this in child components that receive selectedNode prop.
 */
export function useResolvedNode(appName: string, selectedNode: string) {
  const { masterNodeAddress, sortedLocations, isLoading } = useNodeSelection({
    appName,
    autoSelectMaster: false,
  });

  if (selectedNode === "auto") {
    // Prefer master node, but use the correct port from locations
    // (masterNodeAddress from FDM may have wrong port due to toFluxApiPort)
    if (masterNodeAddress && sortedLocations.length > 0) {
      const masterFromLocations = sortedLocations.find((loc) =>
        isSameNodeIp(formatNodeAddress(loc), masterNodeAddress),
      );
      if (masterFromLocations) {
        return {
          resolvedNode: formatNodeAddress(masterFromLocations),
          isMaster: true,
          isLoading,
        };
      }
    }
    // Fallback to first sorted location
    if (sortedLocations.length > 0) {
      return {
        resolvedNode: formatNodeAddress(sortedLocations[0]),
        isMaster: false,
        isLoading,
      };
    }
    return { resolvedNode: null, isMaster: false, isLoading };
  }

  return {
    resolvedNode: selectedNode,
    isMaster: masterNodeAddress
      ? isSameNodeIp(selectedNode, masterNodeAddress)
      : false,
    isLoading,
  };
}
