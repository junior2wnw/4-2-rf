import { NextResponse } from "next/server";

export function isAuthorizedEdgeHeader(header: string | null): boolean {
  const expectedUser = expectedUsername();
  const expectedPassword = expectedPasswordValue();

  if (!expectedUser || !expectedPassword || !header?.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator === -1) {
      return false;
    }

    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return safeEqual(user, expectedUser) && safeEqual(password, expectedPassword);
  } catch {
    return false;
  }
}

export function unauthorizedEdgeResponse(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="4-2 ops", charset="UTF-8"',
    },
  });
}

function expectedUsername(): string | null {
  return process.env.OPS_BASIC_AUTH_USERNAME ?? (process.env.NODE_ENV === "production" ? null : "ops");
}

function expectedPasswordValue(): string | null {
  return process.env.OPS_BASIC_AUTH_PASSWORD ?? (process.env.NODE_ENV === "production" ? null : "change-me-local");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
