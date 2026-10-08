import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "@/lib/auth-token";
import { canOpenRoute, isProtectedRoute, loginDestination } from "@/lib/access-policy";

function withSecurityHeaders(response: NextResponse) {
  const isDev = process.env.NODE_ENV !== "production";
  response.headers.set("Content-Security-Policy", [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.tile.openstreetmap.fr https://unpkg.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us1.locationiq.com https://nominatim.openstreetmap.org https://api.geoapify.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return response;
}

export async function middleware(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  const finish = async (response: NextResponse) => {
    if (session && session.exp - Math.floor(Date.now() / 1000) < SESSION_MAX_AGE - 24 * 60 * 60) {
      const token = await createSessionToken(session.email, session.role, process.env.INTERNAL_AUTH_SECRET!, session.employee_nik);
      response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE });
    }
    return withSecurityHeaders(response);
  };
  const isProtected = isProtectedRoute(request.nextUrl.pathname);
  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return finish(NextResponse.redirect(loginUrl));
  }
  if (session && isProtected && !canOpenRoute(session.role, request.nextUrl.pathname)) {
    const response = NextResponse.redirect(new URL(loginDestination(session.role), request.url));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return finish(response);
  }
  if (request.nextUrl.pathname === "/login" && session) {
    const response = NextResponse.redirect(new URL(loginDestination(session.role, request.nextUrl.searchParams.get("next")), request.url));
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return finish(response);
  }
  const response = NextResponse.next();
  if (isProtected) response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return finish(response);
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/reports/:path*", "/master/:path*", "/settings/:path*", "/public/:path*", "/pwa/:path*"],
};
