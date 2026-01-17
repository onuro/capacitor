import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Delete a file or folder from a single node.
 * Client-side handles retry/fallback logic.
 */
export async function DELETE(request: NextRequest) {
  const zelidauth = request.headers.get("zelidauth");

  if (!zelidauth) {
    return NextResponse.json(
      { status: "error", message: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { nodeIp, appName, component, filePath } = body;

    if (!nodeIp || !appName || !component || !filePath) {
      return NextResponse.json(
        { status: "error", message: "Missing required parameters" },
        { status: 400 },
      );
    }

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

    // Query single node
    const hasPort = nodeIp.includes(":");
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    // Flux uses GET /apps/removeobject/:appname/:component/:filepath
    const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    const encodedPath = encodeURIComponent(cleanPath);
    const endpoint = `/apps/removeobject/${appName}/${component}/${encodedPath}`;
    const nodeUrl = baseUrl + endpoint;

    console.log(`[Delete] Querying ${nodeIp}...`);

    const response = await fetch(nodeUrl, {
      method: "GET",
      headers: {
        zelidauth: authHeader,
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(
        `[Delete] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`,
      );
      return NextResponse.json(
        {
          status: "error",
          message: `Node returned ${response.status}`,
          nodeIp,
        },
        { status: 502 },
      );
    }

    const responseText = await response.text();
    console.log(`[Delete] ${nodeIp} response:`, responseText.slice(0, 200));

    // Try to parse as JSON for error checking
    try {
      const data = JSON.parse(responseText);
      if (data.status === "error") {
        const errorMessage =
          data.message || data.data?.message || "Failed to delete";
        console.log(`[Delete] ${nodeIp} returned error: ${errorMessage}`);
        return NextResponse.json(
          { status: "error", message: errorMessage, nodeIp },
          { status: 502 },
        );
      }
      console.log(`[Delete] SUCCESS from ${nodeIp}`);
      return NextResponse.json({
        status: "success",
        message: data.message || "Deleted successfully",
        nodeIp,
      });
    } catch {
      // Non-JSON response with 2xx status is success
      console.log(`[Delete] SUCCESS from ${nodeIp}`);
      return NextResponse.json({
        status: "success",
        message: "Deleted successfully",
        nodeIp,
      });
    }
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Failed to delete",
      },
      { status: 500 },
    );
  }
}
