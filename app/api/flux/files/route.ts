import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface FileInfo {
  name: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  createdAt: string;
  modifiedAt: string;
}

/**
 * Query a single node for folder contents.
 * Client-side handles retry/fallback logic.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const nodeIp = searchParams.get("nodeIp");
  const appName = searchParams.get("appName");
  const component = searchParams.get("component");
  const folder = searchParams.get("folder") || "";
  const zelidauth = request.headers.get("zelidauth");

  if (!nodeIp || !appName || !component) {
    return NextResponse.json(
      {
        status: "error",
        message: "Missing nodeIp, appName, or component parameter",
      },
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

    let endpoint = `/apps/getfolderinfo/${appName}/${component}`;
    if (folder && folder !== "/") {
      const cleanFolder = folder.startsWith("/") ? folder.slice(1) : folder;
      endpoint += `/${encodeURIComponent(cleanFolder)}`;
    }

    const nodeUrl = baseUrl + endpoint;
    console.log(`[Files] Querying ${nodeIp}...`);

    const response = await fetch(nodeUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(
        `[Files] ${nodeIp} returned ${response.status}: ${text.slice(0, 100)}`,
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

    // Check for HTML response (error page)
    if (responseText.trim().startsWith("<")) {
      console.log(`[Files] ${nodeIp} returned HTML error page`);
      return NextResponse.json(
        { status: "error", message: "Node returned error page", nodeIp },
        { status: 502 },
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.log(`[Files] ${nodeIp} returned invalid JSON`);
      return NextResponse.json(
        { status: "error", message: "Node returned invalid JSON", nodeIp },
        { status: 502 },
      );
    }

    if (data.status === "success") {
      console.log(`[Files] SUCCESS from ${nodeIp}`);
      const files: FileInfo[] = (data.data || []).map((file: FileInfo) => ({
        name: file.name,
        size: file.size || 0,
        isDirectory: file.isDirectory || false,
        modifiedAt: file.modifiedAt || "",
        permissions: file.isDirectory ? "drwxr-xr-x" : "-rw-r--r--",
      }));

      return NextResponse.json({
        status: "success",
        data: { path: folder || "/", files },
        nodeIp,
      });
    }

    // Flux returned an error (e.g., "Application volume not found")
    const errorMessage = data.message || data.data?.message || "Unknown error";
    console.log(`[Files] ${nodeIp} returned error: ${errorMessage}`);
    return NextResponse.json(
      { status: "error", message: errorMessage, nodeIp },
      { status: 502 },
    );
  } catch (error) {
    console.log(
      `[Files] ${nodeIp} failed:`,
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
