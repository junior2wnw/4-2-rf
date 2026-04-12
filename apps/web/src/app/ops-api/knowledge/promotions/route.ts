import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAuthorizedServerHeader, unauthorizedServerResponse } from "@/lib/ops-auth";
import { fetchInternalApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedServerHeader(request.headers.get("authorization"))) {
    return unauthorizedServerResponse();
  }

  const query = request.nextUrl.searchParams.toString();
  const response = await fetchInternalApi(
    `/v1/knowledge/promotions${query ? `?${query}` : ""}`,
    { method: "GET" },
    { admin: true },
  );

  return proxyJson(response);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedServerHeader(request.headers.get("authorization"))) {
    return unauthorizedServerResponse();
  }

  const body = await request.text();
  const response = await fetchInternalApi(
    "/v1/knowledge/promotions",
    {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
      },
    },
    { admin: true },
  );

  return proxyJson(response);
}

async function proxyJson(response: Response): Promise<NextResponse> {
  const payload = await response.text();
  return new NextResponse(payload, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
