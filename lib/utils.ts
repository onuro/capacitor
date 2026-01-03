import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { AppLocation } from "./api/flux-apps"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a node location into IP:port string for API calls.
 * Uses the port from AppLocation if available, otherwise defaults to 16127.
 * Handles cases where loc.ip might already include a port.
 */
export function formatNodeAddress(loc: AppLocation): string {
  // Check if IP already contains a port
  if (loc.ip.includes(':')) {
    return loc.ip;
  }
  return loc.port ? `${loc.ip}:${loc.port}` : `${loc.ip}:16127`;
}
