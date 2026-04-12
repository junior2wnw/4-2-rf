import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAuthorizedServerHeader, unauthorizedServerResponse } from "@/lib/ops-auth";
import { fetchInternalApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ promotionId: string }> },
) {
  if (!isAuthorizedServerHeader(request.headers.get("authorization"))) {
    return unauthorizedServerResponse();
  }

  const { promotionId } = await context.params;
  const response = await fetchInternalApi(
    `/v1/knowledge/promotions/${promotionId}/reject`,
    { method: "POST" },
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
