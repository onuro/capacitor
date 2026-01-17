import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Upload a binary file to a single node.
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
    // Get parameters from query string (to avoid parsing FormData body)
    const { searchParams } = new URL(request.url);
    const nodeIp = searchParams.get("nodeIp");
    const appName = searchParams.get("appName");
    const component = searchParams.get("component") || "wp";
    const folder = searchParams.get("folder") || "";

    if (!nodeIp || !appName) {
      return NextResponse.json(
        {
          status: "error",
          message: "Missing required parameters (nodeIp, appName)",
        },
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

    // Get the raw body and content-type to pass through as-is
    const contentType = request.headers.get("content-type") || "";
    const body = await request.arrayBuffer();

    console.log(
      `[UploadBinary] Body size: ${body.byteLength}, Content-Type: ${contentType}`,
    );

    // Query single node
    const hasPort = nodeIp.includes(":");
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    let endpoint = `/ioutils/fileupload/volume/${appName}/${component}`;
    if (folder) {
      endpoint += `/${encodeURIComponent(folder)}`;
    }
    const nodeUrl = baseUrl + endpoint;

    console.log(`[UploadBinary] Querying ${nodeIp}...`);

    const response = await fetch(nodeUrl, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        zelidauth: authHeader,
      },
      body: body,
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(
        `[UploadBinary] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`,
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
    console.log(
      `[UploadBinary] ${nodeIp} response:`,
      responseText.slice(0, 200),
    );

    // Check if response contains error indication
    if (responseText.includes('"status":"error"')) {
      try {
        const data = JSON.parse(responseText);
        const errorMessage =
          data.message || data.data?.message || "Failed to upload file";
        console.log(`[UploadBinary] ${nodeIp} returned error: ${errorMessage}`);
        return NextResponse.json(
          { status: "error", message: errorMessage, nodeIp },
          { status: 502 },
        );
      } catch {
        // Continue - might be false positive
      }
    }

    console.log(`[UploadBinary] SUCCESS from ${nodeIp}`);
    return NextResponse.json({
      status: "success",
      message: "File uploaded successfully",
      nodeIp,
    });
  } catch (error) {
    console.error("Error uploading binary file:", error);
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to upload file",
      },
      { status: 500 },
    );
  }
}
