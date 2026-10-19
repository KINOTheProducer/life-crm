import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/sign-in", "/sign-up"];

// Optimistic check only: pages still verify the session against the database.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|dav|_next/static|_next/image|favicon.ico|sw.js).*)"],
};
