import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Upload/save a file to a single node.
 * Client-side handles retry/fallback logic.
 */
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
    const { nodeIp, appName, component, filePath, content } = body;

    if (
      !nodeIp ||
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

    let endpoint = `/ioutils/fileupload/volume/${appName}/${component}`;
    if (folder) {
      endpoint += `/${encodeURIComponent(folder)}`;
    }
    const nodeUrl = baseUrl + endpoint;

    console.log(`[Upload] Querying ${nodeIp}...`);

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
    console.log(`[Upload] ${nodeIp} response:`, responseText.slice(0, 200));

    // Try to parse as JSON for error checking
    try {
      const data = JSON.parse(responseText);
      if (data.status === "error") {
        const errorMessage =
          data.message || data.data?.message || "Failed to save file";
        console.log(`[Upload] ${nodeIp} returned error: ${errorMessage}`);
        return NextResponse.json(
          { status: "error", message: errorMessage, nodeIp },
          { status: 502 },
        );
      }
    } catch {
      // Non-JSON response with 2xx status is success (streaming progress data)
    }

    console.log(`[Upload] SUCCESS from ${nodeIp}`);
    return NextResponse.json({
      status: "success",
      message: "File saved successfully",
      nodeIp,
    });
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
