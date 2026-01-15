import { NextRequest, NextResponse } from "next/server";
import { detectMaster, findMasterInNodes } from "@/lib/flux-fdm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface TryNodeResult {
  success: boolean;
  response?: NextResponse;
  error?: string;
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Try to upload file to a single node
 */
async function tryNode(
  nodeIp: string,
  authHeader: string,
  appName: string,
  component: string,
  folder: string,
  fileName: string,
  content: string,
): Promise<TryNodeResult> {
  try {
    const hasPort = nodeIp.includes(":");
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    let endpoint = `/ioutils/fileupload/volume/${appName}/${component}`;
    if (folder) {
      endpoint += `/${encodeURIComponent(folder)}`;
    }
    const nodeUrl = baseUrl + endpoint;

    console.log(`[Upload] Trying ${nodeIp}...`);

    // Create form data with the file content
    const formData = new FormData();
    const blob = new Blob([content], { type: "text/plain" });
    formData.append(fileName, blob);

    const response = await fetch(nodeUrl, {
      method: "POST",
      headers: {
        zelidauth: authHeader,
      },
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(
        `[Upload] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`,
      );
      return {
        success: false,
        error: `Node ${nodeIp} returned ${response.status}`,
      };
    }

    const responseText = await response.text();
    console.log(`[Upload] ${nodeIp} response:`, responseText.slice(0, 200));

    // Try to parse as JSON for error checking
    try {
      const data = JSON.parse(responseText);
      if (data.status === "error") {
        const errorMessage =
          data.message || data.data?.message || "Failed to save file";
        console.log(`[Upload] ${nodeIp} returned error: ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    } catch {
      // Non-JSON response with 2xx status is success (streaming progress data)
    }

    console.log(`[Upload] SUCCESS from ${nodeIp}`);
    return {
      success: true,
      response: NextResponse.json({
        status: "success",
        message: "File saved successfully",
        nodeIp,
      }),
    };
  } catch (error) {
    console.log(
      `[Upload] ${nodeIp} failed:`,
      error instanceof Error ? error.message : error,
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

export async function POST(request: NextRequest) {
  const zelidauth = request.headers.get("zelidauth");

  if (!zelidauth) {
    return NextResponse.json(
      { status: "error", message: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { nodeIp: nodeIpParam, appName, component, filePath, content } = body;

    if (
      !nodeIpParam ||
      !appName ||
      !component ||
      !filePath ||
      content === undefined
    ) {
      return NextResponse.json(
        { status: "error", message: "Missing required parameters" },
        { status: 400 },
      );
    }

    // Parse file path into folder and filename
    const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    const pathParts = cleanPath.split("/");
    const fileName = pathParts.pop() || cleanPath;
    const folder = pathParts.join("/");

    // Parse node IPs (support comma-separated list for fallback)
    const nodeIps = nodeIpParam
      .split(",")
      .map((ip: string) => ip.trim())
      .filter(Boolean);

    // Parse zelidauth and convert to JSON format for nodes
    const params = new URLSearchParams(zelidauth);
    let zelid = params.get("zelid");
    let signature = params.get("signature");
    let loginPhrase = params.get("loginPhrase");

    if (!zelid || !signature || !loginPhrase) {
      const parts = zelidauth.split(":");
      if (parts.length >= 3) {
        zelid = parts[0];
        signature = parts[1];
        loginPhrase = parts.slice(2).join(":");
      }
    }

    let authHeader: string;
    if (zelid && signature && loginPhrase) {
      authHeader = JSON.stringify({ zelid, signature, loginPhrase });
    } else {
      authHeader = zelidauth;
    }

    // 1. Detect master node via FDM (primary) with HAProxy fallback
    console.log(`[Upload] Detecting master node for ${appName}...`);
    const masterIp = await detectMaster(appName);

    // 2. Find the correct IP:port for master by matching against client-provided nodes
    let masterNode: string | null = null;
    if (masterIp) {
      masterNode = findMasterInNodes(masterIp, nodeIps);
      console.log(
        `[Upload] Master node detected: ${masterIp} -> ${masterNode}`,
      );
    } else {
      console.log(`[Upload] No master detected, using client-provided nodes`);
    }

    // 3. Reorder nodes: master first, then others
    const orderedNodes = masterNode
      ? [masterNode, ...nodeIps.filter((ip: string) => ip !== masterNode)]
      : nodeIps;

    let lastError = "";

    // 4. If we have a master, try it with retries (3 attempts, 2s delay)
    if (masterNode && orderedNodes.length > 0) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`[Upload] Master attempt ${attempt}/3 for ${masterNode}`);
        const result = await tryNode(
          masterNode,
          authHeader,
          appName,
          component,
          folder,
          fileName,
          content,
        );

        if (result.success && result.response) {
          return result.response;
        }

        lastError = result.error || "Unknown error";

        // Wait before retry (unless last attempt)
        if (attempt < 3) {
          console.log(`[Upload] Retrying master in 2s...`);
          await sleep(2000);
        }
      }
      console.log(
        `[Upload] Master exhausted after 3 attempts, trying fallback nodes...`,
      );
    }

    // 5. Fall back to other nodes (one attempt each)
    const fallbackNodes = masterNode ? orderedNodes.slice(1) : orderedNodes;
    for (const nodeIp of fallbackNodes) {
      const result = await tryNode(
        nodeIp,
        authHeader,
        appName,
        component,
        folder,
        fileName,
        content,
      );

      if (result.success && result.response) {
        return result.response;
      }

      lastError = result.error || "Unknown error";
    }

    // All nodes failed
    return NextResponse.json(
      { status: "error", message: `Failed to save file. ${lastError}` },
      { status: 502 },
    );
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to save file",
      },
      { status: 500 },
    );
  }
}
