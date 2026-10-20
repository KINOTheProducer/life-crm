import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const authPaths = ["/sign-in", "/sign-up"];

// Optimistic check only: pages still verify the session against the database.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // CardDAV needs PROPFIND and REPORT, which route handlers can't take, so it's served from here.
  if (pathname === "/dav" || pathname.startsWith("/dav/") || pathname.startsWith("/.well-known/carddav")) {
    const { handleDav } = await import("@/lib/dav/server");
    return handleDav(request);
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, "") || "/";
    return NextResponse.redirect(url, 308);
  }
  const hasSession = Boolean(getSessionCookie(request));
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p));
  const isLanding = pathname === "/";

  if (!hasSession && !isAuthPage && !isLanding) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (hasSession && (isAuthPage || isLanding)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dav", "/dav/:path*", "/.well-known/carddav", "/((?!api|dav|_next/static|_next/image|favicon.ico|sw.js|images).*)"],
};
