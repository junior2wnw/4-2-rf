import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAuthorizedEdgeHeader, unauthorizedEdgeResponse } from "@/lib/ops-auth-edge";

export function proxy(request: NextRequest): NextResponse {
  const authorized = isAuthorizedEdgeHeader(request.headers.get("authorization"));
  if (!authorized) {
    return unauthorizedEdgeResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/ops/:path*", "/ops-api/:path*"],
};
