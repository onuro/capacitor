import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Download a file from a single node.
 * Client-side handles retry/fallback logic.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeIp = searchParams.get("nodeIp");
  const appName = searchParams.get("appName");
  const component = searchParams.get("component");
  const filePath = searchParams.get("filePath");
  const zelidauth = request.headers.get("zelidauth");

  if (!nodeIp || !appName || !component || !filePath) {
    return NextResponse.json(
      { status: "error", message: "Missing required parameters" },
      { status: 400 },
    );
  }

  if (!zelidauth) {
    return NextResponse.json(
      { status: "error", message: "Authentication required" },
      { status: 401 },
    );
  }

  // Parse zelidauth and convert to JSON format for nodes
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

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

  if (zelid && signature && loginPhrase) {
    headers["zelidauth"] = JSON.stringify({ zelid, signature, loginPhrase });
  } else {
    headers["zelidauth"] = zelidauth;
  }

  // Query single node
  try {
    const hasPort = nodeIp.includes(":");
    const baseUrl = hasPort ? `http://${nodeIp}` : `http://${nodeIp}:16127`;

    // Build the download URL - Flux uses /apps/downloadfile/:appname/:component/:file
    const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    const endpoint = `/apps/downloadfile/${appName}/${component}/${encodeURIComponent(cleanPath)}`;
    const nodeUrl = baseUrl + endpoint;

    console.log(`[Download] Querying ${nodeIp}...`);

    const response = await fetch(nodeUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(
        `[Download] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`,
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

    // Get response as text first to handle both JSON errors and raw file content
    // Flux may return errors with HTTP 200 and inconsistent content-type headers
    const contentType = response.headers.get("content-type") || "";
    const content = await response.text();

    // Always try to detect Flux API error responses (they return 200 with JSON error body)
    try {
      const parsed = JSON.parse(content);
      if (parsed.status === "error") {
        const errorMessage =
          parsed.message || parsed.data?.message || "Failed to download file";
        console.log(`[Download] ${nodeIp} returned error: ${errorMessage}`);
        return NextResponse.json(
          { status: "error", message: errorMessage, nodeIp },
          { status: 502 },
        );
      }
      // Valid JSON that's not an error - could be a JSON file or Flux success response
      const isFluxResponse =
        typeof parsed.status === "string" && "data" in parsed;
      console.log(`[Download] SUCCESS from ${nodeIp}`);
      return NextResponse.json({
        status: "success",
        data: isFluxResponse ? parsed.data : JSON.stringify(parsed, null, 2),
        contentType: contentType || "application/json",
        nodeIp,
      });
    } catch {
      // Not JSON - return as raw text content (this is the expected case for most files)
      console.log(`[Download] SUCCESS from ${nodeIp}`);
      return NextResponse.json({
        status: "success",
        data: content,
        contentType: contentType || "text/plain",
        nodeIp,
      });
    }
  } catch (error) {
    console.log(
      `[Download] ${nodeIp} failed:`,
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Connection failed",
        nodeIp,
      },
      { status: 502 },
    );
  }
}
