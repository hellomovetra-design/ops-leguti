import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";

const protectedPrefixes = ["/dashboard", "/reports", "/master", "/settings", "/public"];
const adminPrefixes = ["/reports", "/master", "/settings"];
const broadAccessRoles = ["super_admin", "admin", "coordinator", "spv", "jr_spv", "viewer"];

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
  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }
  if (!broadAccessRoles.includes(session?.role || "") && adminPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  const restrictedToSuperAdmin = ["/settings/ops-access", "/master/personnel-changes"];
  if (restrictedToSuperAdmin.some((prefix) => request.nextUrl.pathname.startsWith(prefix)) && session?.role !== "super_admin") {
    return withSecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  if (request.nextUrl.pathname === "/login" && session) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  const response = NextResponse.next();
  if (isProtected) response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/login", "/dashboard/:path*", "/reports/:path*", "/master/:path*", "/settings/:path*", "/public/:path*"],
};
